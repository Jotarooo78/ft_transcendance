import type { Track } from "../types/music";

export type CatalogQuery = { page: number; pageSize: number; q: string; genre: string; sort: "title" | "artist" | "duration" };
export type CatalogList = { items: Track[]; page: number; pageSize: number; total: number; genres: string[] };

export function isTrack(value: unknown): value is Track {
  if (typeof value !== "object" || value === null) return false;
  const track = value as Record<string, unknown>;
  return ["id", "title", "artistName", "albumTitle", "genre"].every(key => typeof track[key] === "string") &&
    (track.audioUrl === null || (typeof track.audioUrl === "string" && /^\/api\/media\/assets\/[0-9a-f-]+\/audio$/i.test(track.audioUrl))) &&
    (track.durationSeconds === null || (typeof track.durationSeconds === "number" && Number.isFinite(track.durationSeconds) && track.durationSeconds > 0));
}

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

export async function getTrack(id: string, signal?: AbortSignal): Promise<Track> {
  const response = await fetch(`/api/catalog/tracks/${encodeURIComponent(id)}`, { signal });
  if (response.status === 404) throw new Error("This track is no longer available.");
  if (!response.ok) throw new Error(`Unable to load track (${response.status}). Please retry.`);
  const track: unknown = await response.json();
  if (!isTrack(track) || track.id !== id) throw new Error("Invalid track response. Please retry.");
  return track;
}
