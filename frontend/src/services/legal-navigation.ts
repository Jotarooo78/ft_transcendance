/** Adresses des pages légales, accessibles avec ou sans session dans le fragment d’URL. */
import type { LegalDocumentId } from "../translations/legal.ts";

/** Lien vers un document légal ; le fragment ne recharge pas l’application ni le lecteur. */
export function legalHref(id: LegalDocumentId): string {
  return `#/legal/${id}`;
}

/** Document légal demandé par l’adresse courante, ou null hors des pages légales. */
export function readLegalRoute(): LegalDocumentId | null {
  const match = /^#\/legal\/(privacy|terms)$/.exec(window.location.hash);
  return match ? (match[1] as LegalDocumentId) : null;
}
