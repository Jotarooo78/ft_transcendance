import { UuidSchema } from '@ft/service-kit'
import { Type } from 'typebox'
/** @brief Types fermés : aimer, enregistrer et suivre restent indépendants. */
const kind = Type.Union(
  ['track', 'project', 'artist', 'playlist'].map((value) => Type.Literal(value))
)
/** @brief Section de bibliothèque demandée. */
export const CollectionParamsSchema = Type.Object({ kind })
/** @brief Cible d'un ajout ou retrait personnel. */
export const CollectionTargetSchema = Type.Object({ kind, id: UuidSchema })
/** @brief Références paginées, sans contenu éventuellement devenu privé. */
export const CollectionPageSchema = Type.Object({
  items: Type.Array(Type.Object({ id: UuidSchema, createdAt: Type.String() })),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
})
