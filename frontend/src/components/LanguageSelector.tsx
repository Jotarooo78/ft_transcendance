/** Choix de langue commun aux pages publiques et privées. */
import { useLanguage } from "../hooks/useLanguage";
import { setLanguage, type Language } from "../services/language";
import { translate } from "../services/translate";
/** Conserve l'écran et les saisies ; seul le texte de l'interface change. */
export default function LanguageSelector() {
  const language = useLanguage();
  return (
    <label className="language-selector">
      <span>{translate("Language")}</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
        <option value="fr" lang="fr">Français</option>
        <option value="en" lang="en">English</option>
        <option value="es" lang="es">Español</option>
      </select>
    </label>
  );
}
