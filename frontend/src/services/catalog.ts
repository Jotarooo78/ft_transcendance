/** Client des lectures publiques Catalogue ; chaque réponse est validée avant son utilisation par React. */
import type { Track } from "../types/music";

/** Paramètres de recherche et de tri transmis au serveur, avec page à partir de 1. */
export type CatalogQuery = {
  /** Numéro de page à partir de 1. */
  page: number;
  /** Nombre maximal d’éléments demandé par page, contrôlé par la route. */
  pageSize: number;
  /** Recherche littérale ; % et _ ne doivent pas devenir des jokers SQL. */
  q: string;
  /** Genre affiché ou filtre exact du Catalogue ; une chaîne vide n’impose pas de filtre. */
  genre: string;
  /** Critère de tri global appliqué avant la pagination. */
  sort: "title" | "artist" | "duration" };
/** Page validée de morceaux avec total filtré et genres disponibles. */
export type CatalogList = {
  /** Éléments de la page ou occurrences de playlist ; le total peut dépasser cette liste. */
  items: Track[];
  /** Numéro de page à partir de 1. */
  page: number;
  /** Nombre maximal d’éléments demandé par page, contrôlé par la route. */
  pageSize: number;
  /** Nombre total d’éléments correspondant au filtre, avant la pagination. */
  total: number;
  /** Genres présents parmi les morceaux publiés, disponibles pour le filtre. */
  genres: string[] };

/**
 * Vérifie les champs publics du morceau, sa durée en secondes et une URL audio relative au service
 * Media.
 */
export function isTrack(value: unknown): value is Track {
  if (typeof value !== "object" || value === null) return false;
  const track = value as Record<string, unknown>;
  return ["id", "title", "artistName", "albumTitle", "genre"].every(key => typeof track[key] === "string") &&
    (track.audioUrl === null || (typeof track.audioUrl === "string" && /^\/api\/media\/assets\/[0-9a-f-]+\/audio$/i.test(track.audioUrl))) &&
    (track.durationSeconds === null || (typeof track.durationSeconds === "number" && Number.isFinite(track.durationSeconds) && track.durationSeconds > 0));
}

/**
 * Envoie les paramètres de recherche et valide la page reçue.
 * @param query Recherche, genre, tri et pagination souhaités.
 * @param signal Annulation lorsque l’écran change de requête.
 * @returns Page confirmée par le serveur ; rejette une panne ou une réponse invalide.
 */
export async function getTracks(query: CatalogQuery, signal?: AbortSignal): Promise<CatalogList> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize), q: query.q,
    genre: query.genre, sort: query.sort });
  const response = await fetch(`/api/catalog/tracks?${params}`, { signal });
  if (!response.ok) throw new Error(`Unable to load catalogue (${response.status}). Please retry.`);
  const data = await response.json() as CatalogList;
  if (!data || !Array.isArray(data.items) || !data.items.every(isTrack) ||
      !Number.isSafeInteger(data.total) || data.total < 0 || data.page !== query.page || data.pageSize !== query.pageSize ||
      !Array.isArray(data.genres) || !data.genres.every(g => typeof g === "string")) {
    throw new Error("Invalid catalogue response. Please retry.");
  }
  return data;
}

/**
 * Charge le détail par UUID et exige une réponse correspondant au morceau demandé ; distingue le 404
 * des autres refus et supporte l’annulation.
 */
export async function getTrack(id: string, signal?: AbortSignal): Promise<Track> {
  const response = await fetch(`/api/catalog/tracks/${encodeURIComponent(id)}`, { signal });
  if (response.status === 404) throw new Error("This track is no longer available.");
  if (!response.ok) throw new Error(`Unable to load track (${response.status}). Please retry.`);
  const track: unknown = await response.json();
  if (!isTrack(track) || track.id !== id) throw new Error("Invalid track response. Please retry.");
  return track;
}
