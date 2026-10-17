import { translate as t } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import LoginForm from "../components/LoginForm";
import type { AuthenticatedUser } from "../types/auth";

type LoginPageProps = {
  onLoginSuccess: (user: AuthenticatedUser) => void;
};

/** Affiche LoginPage dans la langue choisie en conservant son état. */
function LoginPage({ onLoginSuccess }: LoginPageProps) {
  useLanguage();
  return (
    <main>
      <header>
        <h1>{t("Log in")}</h1>

        <p>{t("Access your account and continue listening.")}</p>
      </header>

      <LoginForm onLoginSuccess={onLoginSuccess} />
    </main>
  );
}

export default LoginPage;
