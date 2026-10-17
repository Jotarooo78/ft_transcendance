/** Client des commandes de playlist ; conserve les identifiants d’intention lors d’une réponse incertaine. */
import { requestJson, jsonCommand, RequestError } from "./request-json";
import { isPlaylist, LibraryMutationError } from "./library";
import { authenticatedFetch } from "./api";
import { getAccessToken } from "./session";
/** Commandes métier : l’ordre porte sur les occurrences, les ajouts sur les morceaux. */
export type PlaylistCommand =
  | { kind: "add"; trackIds: string[]; allowDuplicates: boolean }
  | { kind: "reorder"; itemIds: string[] }
  | { kind: "remove"; itemId: string }
  | { kind: "restore"; removalId: string };
/** Enveloppe à réutiliser telle quelle après une panne de transport. */
export type PlaylistAction = PlaylistCommand & {
  operationId: string;
  expectedVersion: number;
};
/** Vérifie les réponses et préserve les codes métier, notamment les confirmations de doublons. */
async function send(path: string, method: string, body: object) {
  try {
    const data = await requestJson(path, jsonCommand(method, body));
    if (!isPlaylist(data)) throw new Error("Invalid playlist response.");
    return data;
  } catch (error) {
    if (error instanceof RequestError && error.code === "version_conflict")
      throw new LibraryMutationError(
        409,
        "This playlist changed. Review it before trying again.",
      );
    throw error;
  }
}
/** Applique une intention atomique. */
export const sendPlaylistAction = (id: string, action: PlaylistAction) =>
  send(`/api/library/playlists/${id}/actions`, "POST", action);
/** Crée une seule copie privée pour cet UUID cible. */
export const duplicatePlaylist = (
  id: string,
  targetId: string,
  expectedVersion: number,
) =>
  send(`/api/library/playlists/${id}/duplicate`, "POST", {
    targetId,
    expectedVersion,
  });
/** Associe une image validée, ou revient à la mosaïque. */
export const setPlaylistArtwork = (
  id: string,
  assetId: string | null,
  expectedVersion: number,
) =>
  send(`/api/library/playlists/${id}/artwork`, "PUT", {
    assetId,
    expectedVersion,
  });
/** Envoie une vraie image à Media ; la session doit encore être la même à la confirmation. */
export async function uploadPlaylistImage(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 25_000_000
  )
    throw new Error("Choose a PNG, JPEG or WebP image up to 25 MB.");
  const token = getAccessToken();
  const body = new FormData();
  body.append("file", file);
  const response = await authenticatedFetch("/api/media/playlist-images", {
    method: "POST",
    body,
  });
  if (token !== getAccessToken()) throw new Error("Your session changed.");
  if (!response.ok) throw new Error("Unable to upload this image.");
  const data: unknown = await response.json();
  if (token !== getAccessToken()) throw new Error("Your session changed.");
  if (
    !data ||
    typeof data !== "object" ||
    !("id" in data) ||
    typeof data.id !== "string"
  )
    throw new Error("Invalid image response.");
  return data.id;
}
