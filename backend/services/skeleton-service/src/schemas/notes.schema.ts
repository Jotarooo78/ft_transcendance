import { UuidSchema } from '@ft/service-kit'
import { Type, type Static } from 'typebox'

export const CreateNoteBodySchema = Type.Object(
  { title: Type.String({ minLength: 1, maxLength: 100 }) },
  { additionalProperties: false }
)

export const NoteParamsSchema = Type.Object({ id: UuidSchema })

export const NoteSchema = Type.Object({ id: UuidSchema, title: Type.String() })

export type CreateNoteBody = Static<typeof CreateNoteBodySchema>
export type NoteParams = Static<typeof NoteParamsSchema>
export type NoteDto = Static<typeof NoteSchema>
