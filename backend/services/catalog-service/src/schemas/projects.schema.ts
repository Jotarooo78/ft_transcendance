/** Validation stricte des demandes de projets ; aucune identité de propriétaire dans le corps. */
import { UuidSchema } from '@ft/service-kit'
import { Type } from 'typebox'
/** Identité stable du projet dans le chemin. */
export const ProjectParams = Type.Object({ id: UuidSchema })
/** Version attendue ; zéro est réservé à la création. */
export const ProjectVersion = Type.Integer({ minimum: 0, maximum: 2147483646 })
/** Taille bornée à cent pistes pour limiter le travail d’une requête. */
export const ProjectBody = Type.Object(
  {
    title: Type.String({ maxLength: 400 }),
    releaseType: Type.Union(
      ['single', 'album', 'mixtape', 'ep'].map((value) => Type.Literal(value))
    ),
    description: Type.String({ maxLength: 10000 }),
    coverAssetId: Type.Union([UuidSchema, Type.Null()]),
    tracks: Type.Array(
      Type.Object(
        { audioAssetId: UuidSchema, title: Type.String({ maxLength: 400 }) },
        { additionalProperties: false }
      ),
      { maxItems: 100 }
    ),
    expectedVersion: ProjectVersion,
  },
  { additionalProperties: false }
)
/** Commande sans autre champ éditable. */
export const ProjectCommand = Type.Object(
  { expectedVersion: ProjectVersion },
  { additionalProperties: false }
)
/** Recherche paginée, commune aux listes privées et publiques. */
export const ProjectQuery = Type.Object(
  {
    q: Type.Optional(Type.String({ maxLength: 200 })),
    page: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
    owner: Type.Optional(UuidSchema),
  },
  { additionalProperties: false }
)
