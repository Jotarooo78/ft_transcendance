/** Règles d’écoute exécutées sous le verrou de session : répétitions identiques et clôtures ne comptent jamais deux fois. */
import { PlaybackError, safeNumber, toSession, type Progress, type Session, type SessionRow } from "./session.js";

/** Événement persisté : séquence, position, cumul déclaré et date de réception côté serveur. */
export type EventRow = {
  /** Numéro positif de l’événement ; une répétition garde le même numéro et les mêmes valeurs. */
  sequence: number;
  /** Position dans le morceau en millisecondes ; un déplacement ne vaut pas du temps écouté. */
  positionMs: bigint;
  /** Cumul local déclaré en millisecondes ; le serveur borne le crédit réellement retenu. */
  listenedMsTotal: bigint;
  /** Date de réception de l’événement, prise sur l’horloge du serveur. */
  receivedAt: Date };
/**
 * Opérations disponibles sous le verrou du propriétaire ; événement et résumé doivent être écrits dans
 * la même transaction.
 */
export type SessionTransaction = {
  /** Session confirmée ou état transactionnel de la session concernée. */
  session: SessionRow;
  /** Lecture d’un événement par séquence dans la transaction de session. */
  getEvent: (sequence: number) => Promise<EventRow | null>;
  /** Création de l’événement dans la même transaction que son résumé. */
  createEvent: (event: EventRow) => Promise<void>;
  /** Enregistre le temps crédité et la dernière séquence de la session. */
  saveProgress: (listenedMs: bigint, sequence: number) => Promise<SessionRow>;
  /** Enregistre la date de clôture sans toucher aux événements. */
  saveClose: (endedAt: Date) => Promise<SessionRow>;
};

// The caller holds the owner's session row lock for this entire operation.
/**
 * Confirme un événement identique déjà reçu sans réécriture ; sinon exige la séquence suivante et une
 * session ouverte. Le crédit est le minimum du cumul nouveau, du temps serveur écoulé et de la durée
 * restante.
 * @param tx Transaction dont le verrou de session est déjà détenu.
 * @param input Position et cumul client en millisecondes, avec séquence positive.
 * @param clock Horloge serveur injectable, en millisecondes.
 * @throws PlaybackError si l’événement contredit une confirmation ou sort du contrat.
 */
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
  /** Ramène une borne temporelle négative à zéro pour ne jamais retirer du temps crédité. */
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

/**
 * Ferme la session une seule fois, sans créer d’événement ni augmenter le temps écouté. Une clôture
 * répétée renvoie l’état déjà confirmé.
 */
export async function recordClose(tx: SessionTransaction, clock: () => number = Date.now): Promise<Session> {
  const row = tx.session;
  const latest = row.lastSequence === 0 ? null : await tx.getEvent(row.lastSequence);
  if (row.lastSequence !== 0 && !latest) throw new Error("Missing latest event");
  if (row.endedAt) return toSession(row, latest?.positionMs ?? 0n);
  const now = Math.trunc(clock());
  if (!Number.isSafeInteger(now)) throw new Error("Invalid server clock");
  const updated = await tx.saveClose(new Date(Math.max(row.startedAt.getTime(), now)));
  return toSession(updated, latest?.positionMs ?? 0n);
}
