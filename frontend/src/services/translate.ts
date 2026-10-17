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
export function translate(
  key: string,
  values: MessageValues = {},
  language: Language = getLanguage(),
): string {
  const dictionary: Record<string, string> = dictionaries[language];
  const source: Record<string, string> = en;
  const text = Object.hasOwn(dictionary, key)
    ? dictionary[key]
    : Object.hasOwn(source, key)
      ? source[key]
      : key;
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
/** Traduit une erreur connue ; une erreur inconnue reçoit un message sûr et compréhensible. */
export function translateError(message: string | undefined): string {
  if (!message) return "";
  if (Object.hasOwn(en, message)) return translate(message as MessageKey);
  // Les services existants conservent leur contrat anglais ; seuls leurs textes connus sont reconnus.
  for (const { key, pattern, names } of messagePatterns) {
    const match = pattern.exec(message);
    if (!match) continue;
    const values = Object.fromEntries(
      names.map((name, index) => [name, match[index + 1]]),
    );
    if (key === "Playlist saved · {0}.")
      values["0"] = translateState(values["0"]);
    return translate(key, values);
  }
  return translate("An unexpected error occurred.");
}
/** Protège les caractères spéciaux d'un texte avant de construire une expression de reconnaissance. */
function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Reconnaît les messages variables conservés dans les états sans traduire les données utilisateur. */
const messagePatterns = Object.keys(en)
  .filter((key) => /\{\w+\}/.test(key))
  .map((key) => {
    const names = [...key.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    return {
      key,
      names,
      pattern: new RegExp(
        "^" +
          key
            .split(/\{\w+\}/)
            .map(escapePattern)
            .join("([\\s\\S]*?)") +
          "$",
      ),
    };
  });
/** Traduit les valeurs métier affichées sans changer les valeurs envoyées au serveur. */
export function translateState(value: string): string {
  const labels: Record<string, string> = {
    public: "Public",
    private: "Private",
    draft: "Draft",
    published: "Published",
    single: "Single",
    album: "Album",
    ep: "EP",
    mixtape: "Mixtape",
  };
  return translate(labels[value] ?? value);
}
/** Choisit le singulier ou le pluriel selon les règles de la langue, puis formate le nombre. */
export function translateCount(
  count: number,
  unit: "track" | "friend" | "second",
): string {
  const singular = new Intl.PluralRules(getLanguage()).select(count) === "one";
  return translate(`{count} ${unit}${singular ? "" : "s"}`, {
    count: formatNumber(count),
  });
}
/** Formate une quantité dans la langue choisie. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(getLanguage()).format(value);
}
/** Formate une date valide ; conserve le texte reçu si sa date est invalide. */
export function formatDate(value: string | null, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    getLanguage(),
    withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium", timeZone: "UTC" },
  ).format(date);
}
