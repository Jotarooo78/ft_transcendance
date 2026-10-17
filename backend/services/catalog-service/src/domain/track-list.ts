/**
 * @file track-list.ts
 * @brief Critères de recherche de la liste des morceaux, et forme de la page renvoyée.
 *
 * @details La route `GET /tracks` accepte des paramètres dans l'URL : un numéro de page, une taille
 *   de page, un texte recherché, un genre, un ordre de tri. Ce fichier définit ces critères une
 *   fois nettoyés, applique leurs valeurs par défaut, et décrit ce que contient une page de
 *   résultats.
 */

import { invalidRequest, toPagination, type Pagination } from '@ft/service-kit'
import type { Track } from './track.js'

/** @brief Les trois façons de trier la liste : par titre, par artiste ou par durée. */
export type TrackSort = 'title' | 'artist' | 'duration' | 'recent'

/**
 * @brief Critères de recherche prêts à être transmis à la base.
 * @details `page` et `pageSize` viennent de la pagination ; `q` est le texte recherché (chaîne vide
 *   = pas de recherche) ; `genre` est le genre exact à filtrer (chaîne vide = tous les genres) ;
 *   `sort` est l'ordre de tri.
 */
export type TrackListQuery = Pagination & {
  q: string
  genre: string
  sort: TrackSort
  owner?: string
}

/**
 * @brief Une page de résultats telle que le client la reçoit.
 * @details `items` contient les morceaux de la page ; `total` est le nombre de morceaux
 *   correspondant à la recherche, toutes pages confondues, ce qui permet au client de savoir
 *   combien de pages il y a ; `genres` est la liste des genres existants, pour proposer un filtre.
 */
export type TrackPage = Pagination & { items: Track[]; total: number; genres: string[] }

/**
 * @brief Paramètres de la liste tels qu'ils arrivent de l'URL.
 * @details Ils sont tous facultatifs et tous sous forme de texte, car une URL ne transporte que du
 *   texte. Leur forme a déjà été vérifiée par le schéma de la route.
 */
type RawTrackQuery = {
  /** @brief Numéro de page, à partir de 1. */
  page?: string
  /** @brief Nombre de morceaux par page. */
  pageSize?: string
  /** @brief Texte recherché. */
  q?: string
  /** @brief Genre exact à filtrer. */
  genre?: string
  /** @brief Critère de tri. */
  /** Compte artiste utilisé pour sa page publique. */
  owner?: string
  sort?: TrackSort
}

/**
 * @brief Transforme les paramètres de l'URL en critères de recherche complets.
 * @details Applique les valeurs par défaut (première page, 20 morceaux, tri par titre), convertit
 *   les numéros de texte en nombres, et retire les espaces autour du texte recherché et du genre.
 * @param query Paramètres de l'URL, déjà validés par le schéma `TrackQuerySchema`.
 * @returns Les critères complets.
 * @throws {DomainError} `400 invalid_request` si la page demandée est hors des bornes autorisées
 *   (par exemple plus de 100 morceaux par page).
 */
export function toTrackListQuery(query: RawTrackQuery): TrackListQuery {
  const pagination = toPagination(query)
  if (!pagination) {
    throw invalidRequest()
  }
  return {
    ...pagination,
    q: (query.q ?? '').trim(),
    genre: (query.genre ?? '').trim(),
    sort: query.sort ?? 'title',
    ...(query.owner ? { owner: query.owner.toLowerCase() } : {}),
  }
}

/**
 * @brief Convertit le nombre de résultats compté par la base en nombre ordinaire.
 * @details PostgreSQL renvoie le résultat de `count(*)` sous forme de `bigint`, que JSON ne sait
 *   pas écrire.
 * @param count Nombre de morceaux compté par la base.
 * @returns Le même nombre, utilisable dans une réponse.
 * @throws {Error} Si le nombre est trop grand pour être exact, ce qui ne peut arriver qu'avec des
 *   données incohérentes.
 */
export function toTotal(count: bigint): number {
  const total = Number(count)
  if (!Number.isSafeInteger(total)) {
    throw new Error('Unrepresentable total')
  }
  return total
}
