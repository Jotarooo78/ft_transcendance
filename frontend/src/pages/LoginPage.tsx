import LoginForm from "../components/LoginForm";
import type { AuthenticatedUser } from "../types/auth";

type LoginPageProps = {
  onLoginSuccess: (user: AuthenticatedUser) => void;
};

function LoginPage({ onLoginSuccess }: LoginPageProps) {
  return (
    <main>
      <header>
        <h1>Log in</h1>

        <p>Access your account and continue listening.</p>
      </header>

      <LoginForm onLoginSuccess={onLoginSuccess} />
    </main>
  );
}

export default LoginPage;
