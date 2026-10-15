import {
  translate as t,
  translateCount,
  translateError,
} from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import { useState, type SubmitEvent } from "react";

import { registerUser } from "../services/auth";
import type { RegisterResponse } from "../types/auth";
import {
  isCanonicalUsername,
  normalizeUsername,
  usernameErrorMessage,
} from "../username";

type RegisterFormValues = {
  username: string;
  displayName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

const initialForm: RegisterFormValues = {
  username: "",
  displayName: "",
  email: "",
  password: "",
  passwordConfirmation: "",
};

/** Affiche RegisterForm dans la langue choisie en conservant son état. */
function RegisterForm() {
  useLanguage();
  const [form, setForm] = useState<RegisterFormValues>(initialForm);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [registration, setRegistration] = useState<RegisterResponse | null>(
    null,
  );

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setRegistration(null);

    // Le username envoyé utilise le même format canonique que les validations Auth, Users et SQL.
    const normalizedUsername = normalizeUsername(form.username);
    const displayName = form.displayName.trim();

    if (!isCanonicalUsername(normalizedUsername)) {
      setErrorMessage(usernameErrorMessage);
      return;
    }

    if (displayName.length < 1 || displayName.length > 60) {
      setErrorMessage("Display name must contain 1 to 60 characters.");
      return;
    }

    if (form.password !== form.passwordConfirmation) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (form.password.length < 12) {
      setErrorMessage("Password must contain at least 12 characters.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await registerUser({
        username: normalizedUsername,
        displayName,
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      setRegistration(result);
      setForm(initialForm);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("An unexpected error occurred.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <label>
          {" "}
          {t("Username")}{" "}
          <input
            type="text"
            required
            minLength={3}
            maxLength={24}
            autoComplete="username"
            aria-describedby="register-username-help"
            value={form.username}
            onChange={(event) => {
              setForm({
                ...form,
                username: event.target.value,
              });
            }}
          />
        </label>

        <p id="register-username-help">
          {" "}
          {t("Use 3 to 24 letters (a-z), numbers or underscores.")}{" "}
        </p>

        <label>
          {" "}
          {t("Display name")}{" "}
          <input
            type="text"
            required
            minLength={1}
            maxLength={60}
            autoComplete="nickname"
            aria-describedby="register-display-name-help"
            value={form.displayName}
            onChange={(event) => {
              setForm({ ...form, displayName: event.target.value });
            }}
          />
        </label>

        <p id="register-display-name-help">
          {" "}
          {t(
            "The name displayed on your profile. Spaces and accents are welcome.",
          )}{" "}
        </p>

        <label>
          {" "}
          {t("Email")}{" "}
          <input
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={form.email}
            onChange={(event) => {
              setForm({
                ...form,
                email: event.target.value,
              });
            }}
          />
        </label>

        <label>
          {" "}
          {t("Password")}{" "}
          <input
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => {
              setForm({
                ...form,
                password: event.target.value,
              });
            }}
          />
        </label>

        <label>
          {" "}
          {t("Confirm password")}{" "}
          <input
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={form.passwordConfirmation}
            onChange={(event) => {
              setForm({
                ...form,
                passwordConfirmation: event.target.value,
              });
            }}
          />
        </label>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("Creating account...") : t("Create account")}
        </button>
      </form>

      {errorMessage && (
        <p className="message error-message" role="alert">
          {translateError(errorMessage)}
        </p>
      )}

      {registration?.status === "registered" && (
        <section className="message success-message" aria-live="polite">
          <h2>{t("Account created")}</h2>
          <p>{t("Your account has been created. You can now log in.")}</p>
        </section>
      )}

      {registration?.status === "pending" && (
        <section className="message" aria-live="polite">
          <h2>{t("Registration in progress")}</h2>
          <p>
            {" "}
            {t("Your profile is being created. Try logging in after {delay}.", {
              delay: translateCount(registration.retryAfterSeconds, "second"),
            })}
          </p>
        </section>
      )}
    </>
  );
}

export default RegisterForm;
