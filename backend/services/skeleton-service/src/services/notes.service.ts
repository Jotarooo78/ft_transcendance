import { noteNotFound, type Note } from '../domain/note.js'
import type { NotesRepository } from '../repositories/notes.repository.js'

export type NotesService = ReturnType<typeof createNotesService>

/** Règles métier des notes ; ne connaît ni HTTP ni la base. */
export function createNotesService(notes: NotesRepository) {
  return {
    create(ownerId: string, title: string): Promise<Note> {
      return notes.create(ownerId, title.trim())
    },

    async get(ownerId: string, id: string): Promise<Note> {
      const note = await notes.findOwned(ownerId, id.toLowerCase())
      if (!note) {
        throw noteNotFound()
      }
      return note
    },
  }
}
