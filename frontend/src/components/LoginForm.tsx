import { useState, type SubmitEvent } from "react";

import { loginUser } from "../services/auth";
import type {
  AuthenticatedUser,
} from "../types/auth";

type LoginFormValues = {
  email: string;
  password: string;
};

const initialForm: LoginFormValues = {
  email: "",
  password: "",
};

function LoginForm() {
  const [form, setForm] =
    useState<LoginFormValues>(initialForm);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [authenticatedUser, setAuthenticatedUser] =
    useState<AuthenticatedUser | null>(null);

  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setErrorMessage("");
    setAuthenticatedUser(null);
    setIsSubmitting(true);

    try {
      const user = await loginUser({
        email: form.email,
        password: form.password,
      });

      setAuthenticatedUser(user);
      setForm(initialForm);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(
          "An unexpected error occurred.",
        );
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

        <button
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Logging in..."
            : "Log in"}
        </button>
      </form>

      {errorMessage && (
        <p
          className="message error-message"
          role="alert"
        >
          {errorMessage}
        </p>
      )}

      {authenticatedUser && (
        <section
          className="message success-message"
          aria-live="polite"
        >
          <h2>Login successful</h2>

          <p>
            Welcome back,{" "}
            {authenticatedUser.displayName}!
          </p>

          <dl>
            <div>
              <dt>Email</dt>
              <dd>{authenticatedUser.email}</dd>
            </div>

            <div>
              <dt>Account type</dt>
              <dd>
                {authenticatedUser.accountType}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </>
  );
}

export default LoginForm;