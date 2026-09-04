import { useState, type SubmitEvent } from "react";

import { registerUser } from "../services/auth";
import type {
  AccountType,
  RegisteredUser,
} from "../types/auth";

type RegisterFormValues = {
  displayName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  accountType: AccountType;
};

const initialForm: RegisterFormValues = {
  displayName: "",
  email: "",
  password: "",
  passwordConfirmation: "",
  accountType: "listener",
};

function RegisterForm() {
  const [form, setForm] =
    useState<RegisterFormValues>(initialForm);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [registeredUser, setRegisteredUser] =
    useState<RegisteredUser | null>(null);

  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setErrorMessage("");
    setRegisteredUser(null);

    if (form.password !== form.passwordConfirmation) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (form.password.length < 12) {
      setErrorMessage(
        "Password must contain at least 12 characters.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const user = await registerUser({
        displayName: form.displayName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        accountType: form.accountType,
      });

      setRegisteredUser(user);
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
          Display name

          <input
            type="text"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            value={form.displayName}
            onChange={(event) => {
              setForm({
                ...form,
                displayName: event.target.value,
              });
            }}
          />
        </label>

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
                passwordConfirmation:
                  event.target.value,
              });
            }}
          />
        </label>

        <label>
          Account type

          <select
            required
            value={form.accountType}
            onChange={(event) => {
              setForm({
                ...form,
                accountType:
                  event.target.value as AccountType,
              });
            }}
          >
            <option value="listener">
              Listener
            </option>

            <option value="artist">
              Artist
            </option>
          </select>
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Creating account..."
            : "Create account"}
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

      {registeredUser && (
        <section
          className="message success-message"
          aria-live="polite"
        >
          <h2>Account created</h2>

          <p>
            Welcome, {registeredUser.displayName}!
          </p>

          <dl>
            <div>
              <dt>Email</dt>
              <dd>{registeredUser.email}</dd>
            </div>

            <div>
              <dt>Account type</dt>
              <dd>{registeredUser.accountType}</dd>
            </div>
          </dl>
        </section>
      )}
    </>
  );
}

export default RegisterForm;