/**
 * @file messages.schema.ts
 * @brief Schémas des routes de messages : ce qu'une requête doit contenir pour être acceptée, et ce
 *   qu'une réponse a le droit de contenir.
 *
 * @details Fastify compare chaque requête au schéma de sa route avant d'exécuter notre code. Si elle
 *   ne correspond pas (champ manquant, champ en trop, mauvais type), il répond `400 invalid_request`
 *   et le contrôleur n'est jamais appelé. À l'inverse, un schéma de réponse sert de filtre : un
 *   champ qui n'y figure pas n'est jamais envoyé au client, même si le code le renvoie.
 *
 * Le texte d'un message n'est pas vérifié ici : sa longueur se mesure après avoir retiré les
 * espaces, ce qu'un schéma ne sait pas faire. Elle est vérifiée dans domain/message.ts.
 */

import { UuidSchema } from '@ft/service-kit'
import { Type, type Static } from 'typebox'

/** @brief Motif d'un entier strictement positif écrit en chiffres ; les paramètres d'URL sont du texte. */
const positiveInteger = '^[1-9][0-9]*$'
/** @brief Motif d'un entier positif ou nul : `after=0` veut dire « tout depuis le début ». */
const nonNegativeInteger = '^[0-9]+$'

/** @brief Partie variable de l'URL `/conversations/:id/...` : l'identifiant de la conversation. */
export const ConversationParamsSchema = Type.Object({ id: UuidSchema })

/** @brief Parties variables de l'URL `/conversations/:id/messages/:messageId`. */
export const MessageParamsSchema = Type.Object({
  id: UuidSchema,
  messageId: Type.String({ pattern: positiveInteger }),
})

/** @brief Corps accepté par `POST .../messages` : le texte, rien d'autre. */
export const SendMessageBodySchema = Type.Object(
  { body: Type.String() },
  { additionalProperties: false }
)

/** @brief Corps accepté par `POST .../read` : le numéro du dernier message lu. */
export const ReadBodySchema = Type.Object(
  { upToMessageId: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }) },
  { additionalProperties: false }
)

/** @brief Paramètres d'URL acceptés par `GET .../messages` : tous facultatifs. */
export const HistoryQuerySchema = Type.Object(
  {
    before: Type.Optional(Type.String({ pattern: positiveInteger })),
    after: Type.Optional(Type.String({ pattern: nonNegativeInteger })),
    limit: Type.Optional(Type.String({ pattern: positiveInteger })),
  },
  { additionalProperties: false }
)

/** @brief Forme d'un message dans une réponse. */
export const MessageSchema = Type.Object({
  id: Type.Integer(),
  conversationId: Type.String(),
  senderUserId: Type.String(),
  body: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  deletedAt: Type.Union([Type.String(), Type.Null()]),
})

/** @brief Forme de la réponse de `GET .../messages` : les messages de la page, et s'il y en a d'autres. */
export const MessagePageSchema = Type.Object({
  items: Type.Array(MessageSchema),
  hasMore: Type.Boolean(),
})

/** @brief Forme de la réponse de `POST .../read` : le dernier message désormais marqué comme lu. */
export const ReadResultSchema = Type.Object({ lastReadMessageId: Type.Integer() })

/** @brief Type TypeScript de l'URL d'une conversation, déduit du schéma. */
export type ConversationParams = Static<typeof ConversationParamsSchema>
/** @brief Type TypeScript de l'URL d'un message, déduit du schéma. */
export type MessageParams = Static<typeof MessageParamsSchema>
/** @brief Type TypeScript du corps d'envoi, déduit du schéma. */
export type SendMessageBody = Static<typeof SendMessageBodySchema>
/** @brief Type TypeScript du corps de lecture, déduit du schéma. */
export type ReadBody = Static<typeof ReadBodySchema>
/** @brief Type TypeScript des paramètres d'historique, déduit du schéma. */
export type HistoryQuery = Static<typeof HistoryQuerySchema>
