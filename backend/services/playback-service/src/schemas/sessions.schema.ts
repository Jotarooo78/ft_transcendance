/**
 * @file sessions.schema.ts
 * @brief Schémas des routes de sessions d'écoute : ce qu'une requête doit contenir pour être
 *   acceptée, et ce qu'une réponse a le droit de contenir.
 *
 * @details Fastify compare chaque requête au schéma de sa route avant d'exécuter notre code. Si
 *   elle ne correspond pas (champ manquant, champ en trop, mauvais type), il répond `400
 *   invalid_request` et le contrôleur n'est jamais appelé.
 */

import { UuidSchema } from '@ft/service-kit'
import { Type, type Static } from 'typebox'

/**
 * @brief Schéma d'une durée ou d'une position en millisecondes : un nombre entier, positif ou nul.
 */
const milliseconds = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
/**
 * @brief Plus grand numéro d'événement accepté : la plus grande valeur que la colonne de la base
 *   peut stocker.
 */
const maxSequence = 2147483647

/** @brief Partie variable de l'URL `/sessions/:id` : l'identifiant de la session. */
export const SessionParamsSchema = Type.Object({ id: UuidSchema })

/** @brief Corps accepté par `POST /sessions` : uniquement l'identifiant du morceau à écouter. */
export const OpenSessionBodySchema = Type.Object(
  { trackId: UuidSchema },
  { additionalProperties: false }
)

/**
 * @brief Corps accepté par `PUT /sessions/:id/progress` : le numéro de l'événement, la position et
 *   le temps total déclaré. Trois entiers, rien d'autre.
 */
export const ProgressBodySchema = Type.Object(
  {
    sequence: Type.Integer({ minimum: 1, maximum: maxSequence }),
    positionMs: milliseconds,
    listenedMsTotal: milliseconds,
  },
  { additionalProperties: false }
)

/** @brief Forme d'une session dans une réponse. Seuls ces champs sont envoyés au client. */
export const SessionSchema = Type.Object({
  id: Type.String(),
  trackId: Type.String(),
  trackDurationMs: Type.Integer(),
  startedAt: Type.String(),
  endedAt: Type.Union([Type.String(), Type.Null()]),
  listenedMs: Type.Integer(),
  lastSequence: Type.Integer(),
  positionMs: Type.Integer(),
})

/**
 * @brief Forme de la réponse de `GET /sessions` : les sessions de la page, leur nombre total, et la
 *   page demandée.
 */
export const SessionPageSchema = Type.Object({
  page: Type.Integer(),
  pageSize: Type.Integer(),
  total: Type.Integer(),
  items: Type.Array(SessionSchema),
})

/** @brief Type TypeScript de la partie variable de l'URL d'une session, déduit du schéma. */
export type SessionParams = Static<typeof SessionParamsSchema>
/** @brief Type TypeScript du corps d'ouverture, déduit du schéma. */
export type OpenSessionBody = Static<typeof OpenSessionBodySchema>
/** @brief Type TypeScript du corps d'un événement de progression, déduit du schéma. */
export type ProgressBody = Static<typeof ProgressBodySchema>
