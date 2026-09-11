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

function LoginForm({ onLoginSuccess }: LoginFormProps) {
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
          Email
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
          Password
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
          {isSubmitting ? "Logging in..." : "Log in"}
        </button>
      </form>

      {errorMessage && (
        <p className="message error-message" role="alert">
          {errorMessage}
        </p>
      )}
    </>
  );
}

export default LoginForm;
