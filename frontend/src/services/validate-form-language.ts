/** Adapte les messages de validation des champs à la langue de l'application. */
import { subscribeLanguage } from "./language";
import { translate } from "./translate";
/** Champs HTML possédant les contraintes et messages de validation utilisés ici. */
type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
/** Reconnaît un champ sans modifier les autres éléments du document. */
function isField(element: EventTarget | null): element is FormField {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}
/** Recalcule les contraintes natives et fournit un message dans la langue courante. */
function updateMessage(field: FormField): void {
  field.setCustomValidity("");
  const validity = field.validity;
  if (validity.valid) return;
  let message = translate("Check this field.");
  if (validity.valueMissing) message = translate("Please fill in this field.");
  else if (
    validity.typeMismatch &&
    field instanceof HTMLInputElement &&
    field.type === "email"
  )
    message = translate("Enter a valid email address.");
  else if (validity.tooShort && "minLength" in field)
    message = translate("Use at least {count} characters.", {
      count: field.minLength,
    });
  else if (validity.tooLong && "maxLength" in field)
    message = translate("Use no more than {count} characters.", {
      count: field.maxLength,
    });
  field.setCustomValidity(message);
}
/** Installe une seule fois les événements ; renvoie le nettoyage pour le rechargement de développement. */
export function installFormLanguage(): () => void {
  /** L'événement invalid précède l'affichage du message par le navigateur. */
  const invalid = (event: Event) => {
    if (isField(event.target)) updateMessage(event.target);
  };
  /** Libère une ancienne erreur afin que les contraintes soient évaluées sur la nouvelle saisie. */
  const input = (event: Event) => {
    if (isField(event.target)) event.target.setCustomValidity("");
  };
  document.addEventListener("invalid", invalid, true);
  document.addEventListener("input", input, true);
  document.addEventListener("change", input, true);
  const unsubscribe = subscribeLanguage(() => {
    document.querySelectorAll("input, textarea, select").forEach((field) => {
      if (isField(field) && field.validity.customError) updateMessage(field);
    });
  });
  return () => {
    unsubscribe();
    document.removeEventListener("invalid", invalid, true);
    document.removeEventListener("input", input, true);
    document.removeEventListener("change", input, true);
  };
}
