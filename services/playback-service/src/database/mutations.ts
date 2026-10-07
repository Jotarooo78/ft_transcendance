import { prisma } from "./prisma.js";
import { recordProgress, type SessionTransaction } from "../progress.js";
import { PlaybackError, type Progress, type Session } from "../session.js";

export async function withSession<T>(owner: string, id: string, change: (tx: SessionTransaction) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM playback.sessions WHERE id=${id}::uuid AND user_id=${owner}::uuid FOR UPDATE`;
    if (!locked[0]) throw new PlaybackError(404, "session_not_found");
    const session = await tx.session.findUniqueOrThrow({ where: { id } });
    return change({ session,
      getEvent: sequence => tx.event.findUnique({ where: { sessionId_sequence: { sessionId: id, sequence } } }),
      createEvent: async event => { await tx.event.create({ data: { ...event, sessionId: id } }); },
      saveProgress: (listenedMs, lastSequence) => tx.session.update({ where: { id }, data: { listenedMs, lastSequence } }),
    });
  });
}

export function progressSession(owner: string, id: string, input: Progress): Promise<Session> {
  return withSession(owner, id, tx => recordProgress(tx, input));
}
