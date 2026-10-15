/** Publication authentifiée d’un audio prêt ; conserve son identifiant entre les reprises. */
import { authenticatedFetch } from "./api";
import { getAccessToken } from "./session";
import { isTrack } from "./catalog";
import type { Track } from "../types/music";

/** Enregistre titre et description ; rejette les réponses tardives d’une ancienne session. */
export async function publishTrack(audioAssetId: string, title: string, description: string, signal: AbortSignal): Promise<Track> {
  const token = getAccessToken();
  const response = await authenticatedFetch("/api/catalog/tracks", { method: "POST", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioAssetId, title, description }) });
  if (signal.aborted || token !== getAccessToken()) throw new Error("Your session changed. Please sign in again.");
  if (response.status === 400) throw new Error("Check the title and description before publishing.");
  if (response.status === 409) throw new Error("This audio is no longer available for publication. Please choose it again.");
  if (response.status !== 201) throw new Error("Publication could not be confirmed. Your audio is kept; retry without uploading it again.");
  const track: unknown = await response.json();
  if (!isTrack(track)) throw new Error("Publication could not be confirmed. Retry with this audio.");
  return track;
}
