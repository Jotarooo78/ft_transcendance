/** Commandes fermées du parcours playlist ; chaque intention possède un UUID conservé lors des retries. */
import { UuidSchema } from '@ft/service-kit'
import { Type, type Static } from 'typebox'
/** Version lue et identifiant de l’intention, distinct de la playlist. */
const base = {
  operationId: UuidSchema,
  expectedVersion: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
}
/** Un ajout est borné à 500 occurrences pour limiter le travail d’une requête. */
export const PlaylistActionSchema = Type.Union([
  Type.Object(
    {
      ...base,
      kind: Type.Literal('add'),
      trackIds: Type.Array(UuidSchema, { minItems: 1, maxItems: 500 }),
      allowDuplicates: Type.Boolean(),
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      ...base,
      kind: Type.Literal('reorder'),
      itemIds: Type.Array(UuidSchema, { maxItems: 10000, uniqueItems: true }),
    },
    { additionalProperties: false }
  ),
  Type.Object(
    { ...base, kind: Type.Literal('remove'), itemId: UuidSchema },
    { additionalProperties: false }
  ),
  Type.Object(
    { ...base, kind: Type.Literal('restore'), removalId: UuidSchema },
    { additionalProperties: false }
  ),
])
/** Demande de duplication ; targetId rend la création rejouable sans seconde copie. */
export const DuplicatePlaylistSchema = Type.Object(
  { targetId: UuidSchema, expectedVersion: base.expectedVersion },
  { additionalProperties: false }
)
/** Données déjà validées par la route, toujours revérifiées sous verrou pour les écritures. */
export type PlaylistAction = Static<typeof PlaylistActionSchema>
