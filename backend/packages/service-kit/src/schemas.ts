import { Type, type Static } from 'typebox'

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const positiveIntegerPattern = '^[1-9][0-9]*$'

/** UUID accepté dans une URL ou un corps ; à normaliser en minuscules avant usage. */
export const UuidSchema = Type.String({ pattern: uuidPattern })

/** Pagination reçue en chaînes dans l'URL ; tout autre paramètre est refusé. */
export const PageQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.String({ pattern: positiveIntegerPattern })),
    pageSize: Type.Optional(Type.String({ pattern: positiveIntegerPattern })),
  },
  { additionalProperties: false }
)

export type PageQuery = Static<typeof PageQuerySchema>
export type Pagination = { page: number; pageSize: number }

const defaultPageSize = 20
const maxPageSize = 100

/** Convertit la pagination validée ; renvoie null si elle dépasse les bornes du contrat. */
export function toPagination(query: PageQuery): Pagination | null {
  const page = Number(query.page ?? 1)
  const pageSize = Number(query.pageSize ?? defaultPageSize)
  const offset = (page - 1) * pageSize
  if (pageSize > maxPageSize || !Number.isSafeInteger(offset)) {
    return null
  }
  return { page, pageSize }
}
