import type { App } from '@ft/service-kit'
import type { NotesController } from '../controllers/notes.controller.js'
import { CreateNoteBodySchema, NoteParamsSchema, NoteSchema } from '../schemas/notes.schema.js'

/** Table des routes des notes : URL, garde d'accès, schémas, puis le contrôleur. */
export function registerNotesRoutes(app: App, notes: NotesController) {
  const onRequest = app.authenticate

  app.post(
    '/notes',
    { onRequest, schema: { body: CreateNoteBodySchema, response: { 201: NoteSchema } } },
    notes.create
  )

  app.get(
    '/notes/:id',
    { onRequest, schema: { params: NoteParamsSchema, response: { 200: NoteSchema } } },
    notes.show
  )
}
