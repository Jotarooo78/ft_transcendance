/** Abonne un composant à la langue sans réinitialiser son état ou ses effets réseau. */
import { useSyncExternalStore } from "react";
import { getLanguage, subscribeLanguage } from "../services/language";
/** La valeur change uniquement lorsque l'utilisateur choisit une autre langue. */
export function useLanguage() {
  return useSyncExternalStore(subscribeLanguage, getLanguage, () => "en" as const);
}
