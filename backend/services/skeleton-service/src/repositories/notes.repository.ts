import { randomUUID } from 'node:crypto'
import type { Note } from '../domain/note.js'

export type NotesRepository = {
  create: (ownerId: string, title: string) => Promise<Note>
  findOwned: (ownerId: string, id: string) => Promise<Note | null>
}

/** Stockage en mémoire du gabarit ; un vrai service utilise Prisma ici, et nulle part ailleurs. */
export function createInMemoryNotesRepository(): NotesRepository {
  const notes = new Map<string, Note>()

  return {
    async create(ownerId, title) {
      const note = { id: randomUUID(), ownerId, title }
      notes.set(note.id, note)
      return note
    },
    async findOwned(ownerId, id) {
      const note = notes.get(id)
      return note?.ownerId === ownerId ? note : null
    },
  }
}
