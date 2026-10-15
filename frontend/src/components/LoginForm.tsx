import { translate as t, translateError } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import { useState, type SubmitEvent } from "react";

import { loginUser } from "../services/auth";
import type { AuthenticatedUser } from "../types/auth";

type LoginFormValues = {
  email: string;
  password: string;
};

type LoginFormProps = {
  onLoginSuccess: (user: AuthenticatedUser) => void;
};

const initialForm: LoginFormValues = {
  email: "",
  password: "",
};

/** Affiche LoginForm dans la langue choisie en conservant son état. */
function LoginForm({ onLoginSuccess }: LoginFormProps) {
  useLanguage();
  const [form, setForm] = useState<LoginFormValues>(initialForm);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const user = await loginUser({
        email: form.email,
        password: form.password,
      });

      setForm(initialForm);
      onLoginSuccess(user);
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
          {t("Email")}{" "}
          <input
            type="email"
            required
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
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => {
              setForm({
                ...form,
                password: event.target.value,
              });
            }}
          />
        </label>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("Logging in...") : t("Log in")}
        </button>
      </form>

      {errorMessage && (
        <p className="message error-message" role="alert">
          {translateError(errorMessage)}
        </p>
      )}
    </>
  );
}

export default LoginForm;
