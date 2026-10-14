/**
 * @file schemas.ts
 * @brief Schémas de validation utilisés par plusieurs services : les identifiants et la pagination.
 *
 * @details Un schéma décrit la forme qu'une donnée doit avoir pour être acceptée. Ceux de ce
 *   fichier servent partout : presque toutes les routes reçoivent un identifiant, et toutes les
 *   listes sont paginées.
 *
 * Un détail technique explique leur forme. Les paramètres d'une URL (`?page=2`) arrivent toujours
 * sous forme de texte, et la validation stricte du projet ne convertit rien. On vérifie donc que le
 * texte ressemble à un nombre, puis on le convertit explicitement avec `toPagination`.
 */

import { Type, type Static } from 'typebox'

/**
 * @brief Forme d'un UUID, l'identifiant unique utilisé pour toutes les données du projet.
 * @details Un UUID est une suite de 32 chiffres hexadécimaux séparés par des tirets, par exemple
 *   `20000000-0000-4000-8000-000000000001`. Majuscules et minuscules sont acceptées.
 */
const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
/**
 * @brief Forme d'un nombre entier strictement positif écrit en chiffres : `1`, `25`, mais ni `0`,
 *   ni `-3`, ni `1.5`.
 */
const positiveIntegerPattern = '^[1-9][0-9]*$'

/**
 * @brief Schéma d'un identifiant (UUID).
 * @details À utiliser pour tout identifiant reçu dans une URL ou dans un corps de requête. Comme
 *   les majuscules sont acceptées mais que la base stocke des minuscules, le code appelle
 *   `.toLowerCase()` avant de chercher en base.
 */
export const UuidSchema = Type.String({ pattern: uuidPattern })

/**
 * @brief Schéma des paramètres de pagination d'une URL : `page` et `pageSize`.
 * @details Les deux sont facultatifs. Tout autre paramètre fait refuser la requête. Les routes qui
 *   acceptent d'autres paramètres (recherche, tri) définissent leur propre schéma.
 */
export const PageQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.String({ pattern: positiveIntegerPattern })),
    pageSize: Type.Optional(Type.String({ pattern: positiveIntegerPattern })),
  },
  { additionalProperties: false }
)

/** @brief Paramètres de pagination tels qu'ils arrivent de l'URL : deux textes facultatifs. */
export type PageQuery = Static<typeof PageQuerySchema>
/**
 * @brief Pagination prête à l'emploi : `page` est le numéro de page en commençant à 1, `pageSize`
 *   le nombre d'éléments par page.
 */
export type Pagination = { page: number; pageSize: number }
/** @brief Limites de pagination qu'une route peut ajuster. */
export type PaginationLimits = {
  /** @brief Nombre d'éléments par page quand le client ne le précise pas. 20 par défaut. */
  defaultPageSize?: number
  /**
   * @brief Nombre maximal d'éléments par page. 100 par défaut, pour qu'un client ne puisse pas
   *   demander toute la base d'un coup.
   */
  maxPageSize?: number
  /**
   * @brief Nombre maximal d'éléments à sauter pour atteindre la page demandée. Certaines routes le
   *   limitent pour rester dans ce que PostgreSQL accepte.
   */
  maxOffset?: number
}

/**
 * @brief Convertit les paramètres de pagination reçus en nombres, et vérifie qu'ils sont
 *   raisonnables.
 * @param query Paramètres de l'URL, déjà validés par `PageQuerySchema`.
 * @param limits Limites propres à la route qui appelle.
 * @returns La pagination, ou null si elle dépasse les limites (page trop grande, trop d'éléments
 *   demandés). Dans ce cas l'appelant répond `400 invalid_request`.
 */
export function toPagination(query: PageQuery, limits: PaginationLimits = {}): Pagination | null {
  const { defaultPageSize = 20, maxPageSize = 100, maxOffset = Number.MAX_SAFE_INTEGER } = limits
  const page = Number(query.page ?? 1)
  const pageSize = Number(query.pageSize ?? defaultPageSize)
  const offset = (page - 1) * pageSize
  const isRepresentable = [page, pageSize, offset].every(Number.isSafeInteger)
  if (!isRepresentable || pageSize > maxPageSize || offset > maxOffset) {
    return null
  }
  return { page, pageSize }
}
