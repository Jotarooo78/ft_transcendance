/** Textes anglais de référence ; les paramètres entre accolades sont remplacés à l'affichage. */
export const en = {
  Language: "Language",
  "An unexpected error occurred.": "An unexpected error occurred.",
} as const;

/** Identifiants communs aux trois dictionnaires. */
export type MessageKey = keyof typeof en;
/** Chaque langue doit fournir tous les textes de référence. */
export type Dictionary = Record<MessageKey, string>;
