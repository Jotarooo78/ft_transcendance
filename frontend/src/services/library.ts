import { requestJson } from "./request-json";
/** Client JWT des playlists persistantes ; les mutations incluent la version connue et ne confirment que la réponse serveur. */
import { authenticatedFetch } from "./api";
import { getAccessToken } from "./session";
import type { MusicPlaylist } from "../types/music";

/**
 * Vérifie l’identité, la version entière positive et chaque occurrence avant d’utiliser une réponse
 * Library.
 */
export function isPlaylist(value: unknown): value is MusicPlaylist {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    (p.visibility === "private" || p.visibility === "public") &&
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.description === "string" &&
    typeof p.version === "number" &&
    Number.isSafeInteger(p.version) &&
    p.version > 0 &&
    Array.isArray(p.items) &&
    p.items.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.trackId === "string" &&
        Number.isInteger(item.position) &&
        item.position > 0,
    )
  );
}

/**
 * Parcourt les pages du compte par lots de 100, avec borne issue du premier total et regroupement par
 * UUID. Annule si le signal ou le compte change ; une actualisation voit les changements ultérieurs.
 */
export async function getPlaylists(
  signal?: AbortSignal,
): Promise<MusicPlaylist[]> {
  const token = getAccessToken();
  const result = new Map<string, MusicPlaylist>();
  let page = 1,
    lastPage = 1;
  do {
    if (signal?.aborted || token !== getAccessToken())
      throw new Error("Playlist loading cancelled.");
    const response = await authenticatedFetch(
      `/api/library/playlists?page=${page}&pageSize=100`,
      { signal },
    );
    if (!response.ok)
      throw new Error("Unable to load playlists. Please try again.");
    const data = await response.json();
    if (
      !Array.isArray(data.items) ||
      !data.items.every(isPlaylist) ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0 ||
      data.page !== page ||
      data.pageSize !== 100
    )
      throw new Error("Invalid playlist response.");
    // Bound traversal by the first response; a later change is seen on refresh.
    if (page === 1) lastPage = Math.max(1, Math.ceil(data.total / 100));
    for (const playlist of data.items) result.set(playlist.id, playlist);
    page++;
  } while (page <= lastPage);
  return [...result.values()];
}

/**
 * Relit une playlist privée par UUID et valide sa structure ; un 404 signifie qu’elle n’est plus
 * accessible.
 */
export async function getPlaylist(
  id: string,
  signal?: AbortSignal,
): Promise<MusicPlaylist> {
  const response = await authenticatedFetch(
    `/api/library/playlists/${encodeURIComponent(id)}`,
    { signal },
  );
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "This playlist is no longer available."
        : "Unable to load playlist.",
    );
  const playlist: unknown = await response.json();
  if (!isPlaylist(playlist)) throw new Error("Invalid playlist response.");
  return playlist;
}

/**
 * Envoie nom et description et renvoie uniquement la playlist confirmée par le serveur, sans ajout
 * optimiste local.
 */
export async function createPlaylist(
  name: string,
  description: string,
  visibility: MusicPlaylist["visibility"] = "private",
): Promise<MusicPlaylist> {
  const response = await authenticatedFetch("/api/library/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, visibility }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 400
        ? "Check the playlist name and description."
        : "Unable to create playlist. Please try again.",
    );
  const playlist: unknown = await response.json();
  if (!isPlaylist(playlist)) throw new Error("Invalid playlist response.");
  return playlist;
}

/**
 * Erreur de mutation avec statut HTTP ; le hook reconnaît notamment 409 pour relire une version
 * périmée.
 */
export class LibraryMutationError extends Error {
  /** Statut HTTP du refus conservé pour que la route ou le client le traite. */
  readonly status: number;
  /** Conserve le statut HTTP et le message utiles à l’écran. */
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Envoie une mutation JSON authentifiée et valide la playlist confirmée ; porte les refus HTTP dans
 * LibraryMutationError.
 */
async function mutatePlaylist(
  path: string,
  method: string,
  body: object,
): Promise<MusicPlaylist> {
  const response = await authenticatedFetch(`/api/library/playlists/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new LibraryMutationError(
      response.status,
      response.status === 404
        ? "The playlist, track or occurrence is no longer available."
        : "Unable to change playlist. Refresh its contents before trying again.",
    );
  const playlist: unknown = await response.json();
  if (!isPlaylist(playlist))
    throw new Error("Invalid playlist response. Refresh before trying again.");
  return playlist;
}

/** Ajoute une occurrence de trackId en transmettant la version courante de la playlist. */
export function addPlaylistItem(playlist: MusicPlaylist, trackId: string) {
  return mutatePlaylist(`${encodeURIComponent(playlist.id)}/items`, "POST", {
    trackId,
    expectedVersion: playlist.version,
  });
}

/** Retire uniquement l’occurrence itemId, avec la version connue du client. */
export function removePlaylistItem(playlist: MusicPlaylist, itemId: string) {
  return mutatePlaylist(
    `${encodeURIComponent(playlist.id)}/items/${encodeURIComponent(itemId)}`,
    "DELETE",
    { expectedVersion: playlist.version },
  );
}

/**
 * Envoie le nom et la description avec expectedVersion pour éviter d’écraser une modification
 * concurrente.
 */
export function updatePlaylist(
  playlist: MusicPlaylist,
  name: string,
  description: string,
  visibility: MusicPlaylist["visibility"] = "private",
) {
  return mutatePlaylist(encodeURIComponent(playlist.id), "PATCH", {
    name,
    description,
    visibility,
    expectedVersion: playlist.version,
  });
}

/**
 * Demande la suppression avec expectedVersion et exige une confirmation 204 ; rejette tout autre
 * résultat.
 */
export async function deletePlaylist(playlist: MusicPlaylist): Promise<void> {
  const response = await authenticatedFetch(
    `/api/library/playlists/${encodeURIComponent(playlist.id)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: playlist.version }),
    },
  );
  if (response.status !== 204)
    throw new LibraryMutationError(
      response.status,
      "Unable to delete playlist. Refresh its contents before trying again.",
    );
}

/** Relit la visibilité à chaque accès public ; un lien privé renvoie 404. */
export async function getPublicPlaylist(
  id: string,
  signal?: AbortSignal,
): Promise<MusicPlaylist> {
  const data = await requestJson(
    `/api/library/public/playlists/${encodeURIComponent(id)}`,
    { signal, cache: "no-store" },
    false,
  );
  if (!isPlaylist(data) || data.visibility !== "public")
    throw new Error("This playlist is no longer available.");
  return data;
}
