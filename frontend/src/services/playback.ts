import { authenticatedFetch } from "./api";
import { PlaybackRequestError } from "./playback-queue";

export type PlaybackSession = { id: string; trackId: string; trackDurationMs: number; startedAt: string; endedAt: string | null;
  listenedMs: number; lastSequence: number; positionMs: number };
export type ProgressPayload = { sequence: number; positionMs: number; listenedMsTotal: number };

export function isPlaybackSession(value: unknown): value is PlaybackSession {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return typeof s.id === "string" && typeof s.trackId === "string" && typeof s.startedAt === "string" &&
    Number.isFinite(Date.parse(s.startedAt)) && (s.endedAt === null || (typeof s.endedAt === "string" && Number.isFinite(Date.parse(s.endedAt)))) &&
    ["trackDurationMs", "listenedMs", "lastSequence", "positionMs"].every(key => typeof s[key] === "number" && Number.isSafeInteger(s[key]) && s[key] >= 0) &&
    (s.trackDurationMs as number) > 0 && (s.listenedMs as number) <= (s.trackDurationMs as number) && (s.positionMs as number) <= (s.trackDurationMs as number);
}

async function writeSession(path: string, method: string, body: object): Promise<PlaybackSession> {
  const response = await authenticatedFetch(`/api/playback/sessions${path}`, { method, keepalive: true,
    signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new PlaybackRequestError(response.status >= 500, "Listening progress could not be saved.");
  const session: unknown = await response.json();
  if (!isPlaybackSession(session)) throw new PlaybackRequestError(false, "Invalid listening response.");
  return session;
}
export async function openPlayback(trackId: string) {
  const session = await writeSession("", "POST", { trackId });
  if (session.trackId !== trackId || session.lastSequence !== 0 || session.listenedMs !== 0 || session.endedAt !== null) {
    throw new PlaybackRequestError(false, "Invalid listening session opening.");
  }
  return session;
}
export const savePlaybackProgress = (id: string, payload: ProgressPayload) => writeSession(`/${encodeURIComponent(id)}/progress`, "PUT", payload);
export const closePlayback = (id: string) => writeSession(`/${encodeURIComponent(id)}/close`, "POST", {});

export type PlaybackHistory = { items: PlaybackSession[]; page: number; pageSize: number; total: number };
export async function getPlaybackHistory(page: number, signal?: AbortSignal): Promise<PlaybackHistory> {
  const response = await authenticatedFetch(`/api/playback/sessions?page=${page}&pageSize=20`, { signal });
  if (!response.ok) throw new Error("Unable to load listening history. Please retry.");
  const data = await response.json();
  if (!data || !Array.isArray(data.items) || !data.items.every(isPlaybackSession) || data.page !== page || data.pageSize !== 20 ||
    !Number.isSafeInteger(data.total) || data.total < 0) throw new Error("Invalid listening history response.");
  return data;
}
