/**
 * @file conversations.schema.ts
 * @brief Schémas des routes de conversations et du ticket WebSocket.
 *
 * @details Même principe que messages.schema.ts : valider ce qui entre, filtrer ce qui sort.
 */

import { UuidSchema } from '@ft/service-kit'
import { Type, type Static } from 'typebox'
import { MessageSchema } from './messages.schema.js'

/** @brief Corps accepté par `POST /conversations` : l'identifiant de l'ami à qui écrire. */
export const OpenConversationBodySchema = Type.Object(
  { peerUserId: UuidSchema },
  { additionalProperties: false }
)

/** @brief Forme d'une conversation dans une réponse. */
export const ConversationSchema = Type.Object({
  id: Type.String(),
  peerUserId: Type.String(),
  lastMessage: Type.Union([MessageSchema, Type.Null()]),
  unreadCount: Type.Integer(),
  lastMessageAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
})

/**
 * @brief Forme de la réponse de `GET /conversations` : les conversations de la page, leur nombre
 *   total, et la page demandée. Même enveloppe que la liste des playlists.
 */
export const ConversationPageSchema = Type.Object({
  items: Type.Array(ConversationSchema),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
})

/** @brief Forme de la réponse de `GET /unread` : le nombre total de messages non lus. */
export const UnreadSchema = Type.Object({ total: Type.Integer() })

/** @brief Forme de la réponse de `POST /ws-ticket`. */
export const TicketSchema = Type.Object({
  ticket: Type.String(),
  expiresInSeconds: Type.Integer(),
})

/** @brief Paramètre d'URL obligatoire de la connexion WebSocket : le ticket. */
export const WsQuerySchema = Type.Object(
  { ticket: Type.String({ minLength: 1, maxLength: 200 }) },
  { additionalProperties: false }
)

/** @brief Type TypeScript du corps d'ouverture, déduit du schéma. */
export type OpenConversationBody = Static<typeof OpenConversationBodySchema>
/** @brief Type TypeScript de la requête WebSocket, déduit du schéma. */
export type WsQuery = Static<typeof WsQuerySchema>
