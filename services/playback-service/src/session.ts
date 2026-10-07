export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Session = { id: string; trackId: string; trackDurationMs: number; startedAt: string; endedAt: string | null;
  listenedMs: number; lastSequence: number; positionMs: number };
export type SessionRow = { id: string; trackId: string; trackDurationMs: bigint; startedAt: Date; endedAt: Date | null;
  listenedMs: bigint; lastSequence: number };
export class PlaybackError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
export function safeNumber(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Unsupported stored integer");
  return Number(value);
}
export function toSession(row: SessionRow, positionMs = 0n): Session {
  const duration = safeNumber(row.trackDurationMs), listened = safeNumber(row.listenedMs), position = safeNumber(positionMs);
  if (duration <= 0 || listened > duration || position > duration || !Number.isInteger(row.lastSequence) || row.lastSequence < 0) throw new Error("Invalid stored session");
  return { id: row.id, trackId: row.trackId, trackDurationMs: duration, startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null, listenedMs: listened, lastSequence: row.lastSequence, positionMs: position };
}
export function openInput(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && typeof body.trackId === "string" && uuidPattern.test(body.trackId) ? body.trackId.toLowerCase() : null;
}
