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

export type Progress = { sequence: number; positionMs: number; listenedMsTotal: number };
export function progressInput(value: unknown): Progress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 3 || !["sequence", "positionMs", "listenedMsTotal"].every(key =>
    typeof body[key] === "number" && Number.isSafeInteger(body[key]) && body[key] >= 0)) return null;
  if ((body.sequence as number) < 1 || (body.sequence as number) > 2147483647) return null;
  return body as Progress;
}

export type PageQuery = { page: number; pageSize: number };
export type SessionPage = PageQuery & { total: number; items: Session[] };
export function pageQuery(query: Record<string, unknown>): PageQuery | null {
  if (Object.keys(query).some(key => !["page", "pageSize"].includes(key))) return null;
  const positive = (value: unknown, fallback: number) => value === undefined ? fallback :
    typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
  const page = positive(query.page, 1), pageSize = positive(query.pageSize, 20);
  const skip = (page - 1) * pageSize;
  return Number.isFinite(page) && Number.isFinite(pageSize) && pageSize <= 100 && Number.isSafeInteger(skip) && skip <= 2147483647 ? { page, pageSize } : null;
}
export function toHistorySession(row: SessionRow & { events: Array<{ sequence: number; positionMs: bigint }> }): Session {
  const latest = row.events.find(event => event.sequence === row.lastSequence);
  if (row.lastSequence > 0 && !latest) throw new Error("Missing latest event");
  return toSession(row, latest?.positionMs ?? 0n);
}
