/** Transactions SQL d’écoute : le propriétaire et le verrou de session sont vérifiés avant toute progression ou clôture. */
import { prisma } from "./prisma.js";
import { recordClose, recordProgress, type SessionTransaction } from "../progress.js";
import { PlaybackError, type Progress, type Session } from "../session.js";

/**
 * Verrouille la session identifiée et détenue par owner avec FOR UPDATE ; exécute le changement et
 * toutes ses écritures dans la même transaction. Rejette une session étrangère ou absente avec 404.
 */
export async function withSession<T>(owner: string, id: string, change: (tx: SessionTransaction) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{
      /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
      id: string }>>`
      SELECT id FROM playback.sessions WHERE id=${id}::uuid AND user_id=${owner}::uuid FOR UPDATE`;
    if (!locked[0]) throw new PlaybackError(404, "session_not_found");
    const session = await tx.session.findUniqueOrThrow({ where: { id } });
    return change({ session,
      /** Lit l’événement de cette session pour une séquence donnée, sous le verrou en cours. */
      getEvent: sequence => tx.event.findUnique({ where: { sessionId_sequence: { sessionId: id, sequence } } }),
      /** Persiste l’événement en lui associant cette session ; l’unicité protège les séquences. */
      createEvent: async event => { await tx.event.create({ data: { ...event, sessionId: id } }); },
      /** Met à jour le résumé de la session dans la même transaction que l’événement. */
      saveProgress: (listenedMs, lastSequence) => tx.session.update({ where: { id }, data: { listenedMs, lastSequence } }),
      /** Enregistre la date de fin de la session sous le verrou existant. */
      saveClose: endedAt => tx.session.update({ where: { id }, data: { endedAt } }),
    });
  });
}

/**
 * Applique les règles de progression sous le verrou SQL du propriétaire ; aucun événement ne peut être
 * ajouté hors de cette transaction.
 */
export function progressSession(owner: string, id: string, input: Progress): Promise<Session> {
  return withSession(owner, id, tx => recordProgress(tx, input));
}

/** Applique la clôture idempotente sous le verrou SQL du propriétaire, sans ajouter de temps écouté. */
export function closeSession(owner: string, id: string): Promise<Session> {
  return withSession(owner, id, tx => recordClose(tx));
}
