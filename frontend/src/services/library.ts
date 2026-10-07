import { authenticatedFetch } from "./api";
import { getAccessToken } from "./session";
import type { PrivatePlaylist } from "../types/music";

export function isPlaylist(value: unknown): value is PrivatePlaylist {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.name === "string" && typeof p.description === "string" &&
    typeof p.version === "number" && Number.isSafeInteger(p.version) && p.version > 0 && Array.isArray(p.items) &&
    p.items.every(item => item && typeof item === "object" && typeof item.id === "string" &&
      typeof item.trackId === "string" && Number.isInteger(item.position) && item.position > 0);
}

export async function getPlaylists(signal?: AbortSignal): Promise<PrivatePlaylist[]> {
  const token = getAccessToken();
  const result = new Map<string, PrivatePlaylist>();
  let page = 1, lastPage = 1;
  do {
    if (signal?.aborted || token !== getAccessToken()) throw new Error("Playlist loading cancelled.");
    const response = await authenticatedFetch(`/api/library/playlists?page=${page}&pageSize=100`, { signal });
    if (!response.ok) throw new Error("Unable to load playlists. Please try again.");
    const data = await response.json();
    if (!Array.isArray(data.items) || !data.items.every(isPlaylist) || !Number.isSafeInteger(data.total) || data.total < 0 ||
      data.page !== page || data.pageSize !== 100) throw new Error("Invalid playlist response.");
    // Bound traversal by the first response; a later change is seen on refresh.
    if (page === 1) lastPage = Math.max(1, Math.ceil(data.total / 100));
    for (const playlist of data.items) result.set(playlist.id, playlist);
    page++;
  } while (page <= lastPage);
  return [...result.values()];
}

export async function getPlaylist(id: string, signal?: AbortSignal): Promise<PrivatePlaylist> {
  const response = await authenticatedFetch(`/api/library/playlists/${encodeURIComponent(id)}`, { signal });
  if (!response.ok) throw new Error(response.status === 404 ? "This playlist is no longer available." : "Unable to load playlist.");
  const playlist: unknown = await response.json();
  if (!isPlaylist(playlist)) throw new Error("Invalid playlist response.");
  return playlist;
}

export async function createPlaylist(name: string, description: string): Promise<PrivatePlaylist> {
  const response = await authenticatedFetch("/api/library/playlists", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description }),
  });
  if (!response.ok) throw new Error(response.status === 400 ? "Check the playlist name and description." : "Unable to create playlist. Please try again.");
  const playlist: unknown = await response.json();
  if (!isPlaylist(playlist)) throw new Error("Invalid playlist response.");
  return playlist;
}
