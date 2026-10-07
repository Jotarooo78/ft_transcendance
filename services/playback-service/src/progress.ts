import { PlaybackError, safeNumber, toSession, type Progress, type Session, type SessionRow } from "./session.js";

export type EventRow = { sequence: number; positionMs: bigint; listenedMsTotal: bigint; receivedAt: Date };
export type SessionTransaction = {
  session: SessionRow;
  getEvent: (sequence: number) => Promise<EventRow | null>;
  createEvent: (event: EventRow) => Promise<void>;
  saveProgress: (listenedMs: bigint, sequence: number) => Promise<SessionRow>;
};

// The caller holds the owner's session row lock for this entire operation.
export async function recordProgress(tx: SessionTransaction, input: Progress, clock: () => number = Date.now): Promise<Session> {
  const row = tx.session;
  const existing = await tx.getEvent(input.sequence);
  if (existing) {
    if (existing.positionMs !== BigInt(input.positionMs) || existing.listenedMsTotal !== BigInt(input.listenedMsTotal)) {
      throw new PlaybackError(409, "progress_conflict");
    }
    const latest = input.sequence === row.lastSequence ? existing : await tx.getEvent(row.lastSequence);
    if (!latest) throw new Error("Missing latest event");
    // Confirm even an older event or a now-closed session without a second write.
    return toSession(row, latest.positionMs);
  }
  if (row.endedAt || input.sequence !== row.lastSequence + 1) throw new PlaybackError(409, "progress_conflict");
  if (input.positionMs > safeNumber(row.trackDurationMs)) throw new PlaybackError(400, "invalid_request");
  const previous = row.lastSequence === 0 ? null : await tx.getEvent(row.lastSequence);
  if (row.lastSequence !== 0 && !previous) throw new Error("Missing previous event");
  const declared = BigInt(input.listenedMsTotal), previousDeclared = previous?.listenedMsTotal ?? 0n;
  if (declared < previousDeclared) throw new PlaybackError(409, "progress_conflict");
  const now = Math.trunc(clock());
  if (!Number.isSafeInteger(now)) throw new Error("Invalid server clock");
  const nonnegative = (value: bigint) => value < 0n ? 0n : value;
  const bounds = [declared - previousDeclared,
    nonnegative(BigInt(now - (previous?.receivedAt ?? row.startedAt).getTime())),
    nonnegative(BigInt(now - row.startedAt.getTime()) - row.listenedMs),
    nonnegative(row.trackDurationMs - row.listenedMs)];
  const added = bounds.reduce((a, b) => a < b ? a : b);
  await tx.createEvent({ sequence: input.sequence, positionMs: BigInt(input.positionMs), listenedMsTotal: declared, receivedAt: new Date(now) });
  const updated = await tx.saveProgress(row.listenedMs + added, input.sequence);
  return toSession(updated, BigInt(input.positionMs));
}
