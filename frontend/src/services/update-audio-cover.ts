/** Modifie uniquement la pochette d’un audio déjà envoyé ; aucune seconde réception de l’audio n’est nécessaire. */
import { authenticatedFetch } from "./api";
import { getAccessToken } from "./session";
import { isAudioCover, type AudioCover } from "../types/files";

/** Envoie une image validée ; confirme la nouvelle représentation seulement pour la session restée courante. */
export async function replaceAudioCover(id: string, image: File, signal: AbortSignal): Promise<AudioCover> {
  const token = getAccessToken(), body = new FormData(); body.append("file", image);
  const response = await authenticatedFetch(`/api/media/assets/${encodeURIComponent(id)}/cover`, { method: "PUT", body, signal });
  if (signal.aborted || token !== getAccessToken()) throw new Error("Cover update cancelled after an account change.");
  if (!response.ok) {
    const messages: Record<number, string> = { 404: "This audio is no longer available.", 413: "The cover exceeds 25 MB.", 415: "This cover image is invalid or unsupported.", 422: "Cover dimensions or processing limits exceeded.", 503: "The cover service is busy or unavailable. Please retry." };
    throw new Error(messages[response.status] ?? "Unable to update the cover.");
  }
  const result = await response.json();
  if (signal.aborted || token !== getAccessToken()) throw new Error("Cover update cancelled after an account change.");
  if (!isAudioCover(result?.cover)) throw new Error("Invalid cover response. Check the automatically updated list before trying again.");
  return result.cover;
}

/** Détache la pochette après confirmation ; l’original audio et son aperçu restent disponibles. */
export async function removeAudioCover(id: string, signal: AbortSignal): Promise<void> {
  const token = getAccessToken();
  const response = await authenticatedFetch(`/api/media/assets/${encodeURIComponent(id)}/cover`, { method: "DELETE", signal });
  if (signal.aborted || token !== getAccessToken()) throw new Error("Cover removal cancelled after an account change.");
  if (response.status !== 204) throw new Error("Unable to remove the cover. Please retry.");
}
