/** Affichage des textes ; les valeurs des utilisateurs sont interpolées sans être traduites. */
import { en, type MessageKey } from "../translations/en.ts";
import { fr } from "../translations/fr.ts";
import { es } from "../translations/es.ts";
import { getLanguage, type Language } from "./language.ts";
/** Valeurs variables d'une phrase, conservées comme texte React. */
export type MessageValues = Record<string, string | number>;
/** Dictionnaires livrés avec l'application, disponibles sans appel réseau. */
const dictionaries = { en, fr, es };
/** Traduit une phrase connue et remplace ses paramètres ; l'anglais assure le repli. */
export function translate(key: string, values: MessageValues = {}, language: Language = getLanguage()): string {
  const dictionary: Record<string, string> = dictionaries[language];
  const source: Record<string, string> = en;
  const text = Object.hasOwn(dictionary, key) ? dictionary[key] : Object.hasOwn(source, key) ? source[key] : key;
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => Object.hasOwn(values, name) ? String(values[name]) : placeholder);
}
/** Traduit une erreur connue ; une erreur inconnue reçoit un message sûr et compréhensible. */
export function translateError(message: string | undefined): string {
  if (!message) return "";
  if (Object.hasOwn(en, message)) return translate(message as MessageKey);
  return translate("An unexpected error occurred.");
}
/** Formate une quantité dans la langue choisie. */
export function formatNumber(value: number): string { return new Intl.NumberFormat(getLanguage()).format(value); }
/** Formate une date valide ; conserve le texte reçu si sa date est invalide. */
export function formatDate(value: string, withTime = false): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(getLanguage(), withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
