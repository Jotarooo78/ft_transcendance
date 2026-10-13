import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Note } from '../domain/note.js'
import type { CreateNoteBody, NoteDto, NoteParams } from '../schemas/notes.schema.js'
import type { NotesService } from '../services/notes.service.js'

export type NotesController = ReturnType<typeof createNotesController>

const toDto = (note: Note): NoteDto => ({ id: note.id, title: note.title })

/** Traduit HTTP vers le service et le résultat vers le DTO public ; aucune règle métier ici. */
export function createNotesController(notes: NotesService) {
  return {
    async create(request: FastifyRequest<{ Body: CreateNoteBody }>, reply: FastifyReply) {
      const note = await notes.create(request.userId, request.body.title)
      return reply.code(201).send(toDto(note))
    },

    async show(request: FastifyRequest<{ Params: NoteParams }>) {
      const note = await notes.get(request.userId, request.params.id)
      return toDto(note)
    },
  }
}
