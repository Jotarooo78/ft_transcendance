/** Dates de la messagerie, dans la langue et le fuseau de l'utilisateur. */
import { getLanguage } from "./language";

/** Heure courte d'un message (« 14:05 », « 2:05 PM »). */
export function formatClock(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(getLanguage(), { timeStyle: "short" }).format(
    date,
  );
}

/** Jour d'un message, pour séparer les échanges de dates différentes. */
export function formatDay(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(getLanguage(), { dateStyle: "medium" }).format(
    date,
  );
}

/** Date et heure complètes, pour l'infobulle d'un message. */
export function formatFull(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(getLanguage(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Moment du dernier message dans la liste : l'heure aujourd'hui, la date sinon. */
export function formatListTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? formatClock(value)
    : new Intl.DateTimeFormat(getLanguage(), {
        day: "numeric",
        month: "short",
      }).format(date);
}
