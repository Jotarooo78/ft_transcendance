import { DomainError } from '@ft/service-kit'

export type Note = { id: string; ownerId: string; title: string }

export const noteNotFound = () => new DomainError(404, 'note_not_found')
