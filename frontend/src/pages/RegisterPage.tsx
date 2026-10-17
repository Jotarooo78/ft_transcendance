import { translate as t } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import RegisterForm from "../components/RegisterForm";

/** Affiche RegisterPage dans la langue choisie en conservant son état. */
function RegisterPage() {
  useLanguage();
  return (
    <main>
      <header>
        <h1>{t("Create your account")}</h1>

        <p>{t("Join our independent music community.")}</p>
      </header>

      <RegisterForm />
    </main>
  );
}

export default RegisterPage;
