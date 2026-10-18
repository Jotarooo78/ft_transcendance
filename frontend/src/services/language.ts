/** Choix de langue partagé : préférence locale, langues du navigateur, puis anglais. */
export type Language = "en" | "fr" | "es";
/** Clé indépendante du compte, pour conserver le choix après déconnexion. */
export const languageStorageKey = "ft-goodvibes-language";
/** Langue supportée après retrait d'une éventuelle région (fr-CA, es-MX). */
function supported(value: string): Language | undefined {
  const base = value.toLowerCase().split(/[-_]/)[0];
  return base === "en" || base === "fr" || base === "es" ? base : undefined;
}
/** Choisit la première préférence disponible ; ignore une sauvegarde non valide. */
export function resolveLanguage(
  saved: string | null,
  preferences: readonly string[],
): Language {
  if (saved === "en" || saved === "fr" || saved === "es") return saved;
  for (const value of preferences) {
    const language = supported(value);
    if (language) return language;
  }
  return "en";
}
/** Lit le stockage sans empêcher le démarrage lorsque le navigateur en interdit l'accès. */
function initialLanguage(): Language {
  let saved: string | null = null;
  try {
    saved = globalThis.localStorage?.getItem(languageStorageKey) ?? null;
  } catch {
    /* Préférence en mémoire uniquement. */
  }
  return resolveLanguage(saved, globalThis.navigator?.languages ?? []);
}
/** Langue courante en mémoire ; ne dépend ni du compte ni de l'état du lecteur. */
let language = initialLanguage();
/** Abonnements React préservant les composants déjà montés lors d'un changement. */
const listeners = new Set<() => void>();
/** Renvoie la valeur courante pour les composants et les formateurs. */
export function getLanguage(): Language {
  return language;
}
/** Enregistre un abonné et fournit sa fonction de désinscription. */
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Actualise la langue accessible aux lecteurs d'écran. */
export function updateDocumentLanguage(): void {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}
/** Applique immédiatement le choix et tente de le mémoriser sans interrompre l'interface. */
export function setLanguage(next: Language): void {
  language = next;
  try {
    globalThis.localStorage?.setItem(languageStorageKey, next);
  } catch {
    /* Le choix reste actif pour cette visite. */
  }
  updateDocumentLanguage();
  listeners.forEach((listener) => listener());
}
