import { useState, type SubmitEvent } from "react";

import { registerUser } from "../services/auth";
import type { RegisterResponse } from "../types/auth";

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

function RegisterForm() {
  const [form, setForm] = useState<RegisterFormValues>(initialForm);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [registration, setRegistration] = useState<RegisterResponse | null>(
    null
  );

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setRegistration(null);

    const username = form.username.trim().toLowerCase();
    const displayName = form.displayName.trim();

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      setErrorMessage(
        "Username must contain 3 to 30 letters, numbers or underscores."
      );
      return;
    }

    if (displayName.length < 2 || displayName.length > 100) {
      setErrorMessage("Display name must contain 2 to 100 characters.");
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
        username,
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
          Username
          <input
            type="text"
            required
            minLength={3}
            maxLength={30}
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
          Use 3 to 30 letters (a-z), numbers or underscores.
        </p>

        <label>
          Display name
          <input
            type="text"
            required
            minLength={2}
            maxLength={100}
            autoComplete="nickname"
            aria-describedby="register-display-name-help"
            value={form.displayName}
            onChange={(event) => {
              setForm({ ...form, displayName: event.target.value });
            }}
          />
        </label>

        <p id="register-display-name-help">
          The name displayed on your profile. Spaces and accents are welcome.
        </p>

        <label>
          Email
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
          Password
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
          Confirm password
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
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </form>

      {errorMessage && (
        <p className="message error-message" role="alert">
          {errorMessage}
        </p>
      )}

      {registration?.status === "registered" && (
        <section className="message success-message" aria-live="polite">
          <h2>Account created</h2>
          <p>Your account has been created. You can now log in.</p>
        </section>
      )}

      {registration?.status === "pending" && (
        <section className="message" aria-live="polite">
          <h2>Registration in progress</h2>
          <p>
            Your profile is being created. Try logging in after{" "}
            {registration.retryAfterSeconds} seconds.
          </p>
        </section>
      )}
    </>
  );
}

export default RegisterForm;
