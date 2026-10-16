/**
 * @file helpers.ts
 * @brief Outils partagés par les tests de chat-service.
 *
 * @details Les tests ne démarrent ni base de données ni réseau. Ils construisent le serveur avec
 *   `buildApp` en lui donnant de faux repositories en mémoire, un faux client de user-service et un
 *   vrai hub WebSocket (qui ne dépend de rien), puis lui envoient des requêtes avec `app.inject`
 *   (et `app.injectWS` pour le WebSocket). Ce fichier fournit ces fausses dépendances, des
 *   identifiants d'exemple et la fonction qui construit le serveur de test.
 */

import { randomUUID } from 'node:crypto'
import type { WebSocket } from 'ws'
import { buildApp, type Dependencies } from '../src/app.js'
import type { UsersClient } from '../src/clients/users.client.js'
import {
  lastReadBy,
  type ConversationRow,
  type ConversationSummary,
} from '../src/domain/conversation.js'
import type { MessageRow } from '../src/domain/message.js'
import { createHub } from '../src/realtime/hub.js'
import type { ConversationsRepository } from '../src/repositories/conversations.repository.js'
import type { MessagesRepository } from '../src/repositories/messages.repository.js'
import { createTicketsService } from '../src/services/tickets.service.js'

/** @brief Identifiant du compte d'Alice. Les trois identifiants sont rangés dans l'ordre alphabétique. */
export const alice = '40000000-0000-4000-8000-00000000000a'
/** @brief Identifiant du compte de Bob, ami d'Alice dans les tests. */
export const bob = '40000000-0000-4000-8000-00000000000b'
/** @brief Identifiant du compte d'Eve, l'étrangère : amie de personne, sauf si le test en décide autrement. */
export const eve = '40000000-0000-4000-8000-00000000000c'
/** @brief Secret utilisé pour signer les jetons de connexion dans les tests. */
export const jwtSecret = 'test-only-chat-secret'

/**
 * @brief Crée un faux client de user-service qui garde les amitiés en mémoire.
 * @returns Le faux client, des fonctions pour créer ou rompre une amitié, et son état : un
 *   interrupteur `failure` pour simuler une panne de user-service.
 */
export function createFakeUsers() {
  const state = { friends: new Set<string>(), failure: false }
  const key = (a: string, b: string) => [a, b].sort().join('|')
  const client: UsersClient = {
    async areFriends(a, b) {
      if (state.failure) {
        throw new Error('users unavailable')
      }
      return state.friends.has(key(a, b))
    },
  }
  return {
    client,
    state,
    befriend: (a: string, b: string) => state.friends.add(key(a, b)),
    unfriend: (a: string, b: string) => state.friends.delete(key(a, b)),
  }
}

/**
 * @brief Crée de faux repositories qui gardent conversations et messages en mémoire.
 * @details Ils appliquent les mêmes règles que les vrais : conversation unique par paire, filtre
 *   d'appartenance, numéros de messages croissants, repère de lecture qui ne recule jamais, nombre de
 *   non-lus calculé. Les dates sont déterministes (une seconde par numéro de message) pour que les
 *   tris soient reproductibles.
 * @returns Les deux faux repositories, et leur état : les lignes, et un interrupteur `failure` pour
 *   simuler une panne de base.
 */
export function createFakeChat() {
  const state = {
    conversations: [] as ConversationRow[],
    messages: [] as MessageRow[],
    nextId: 1n,
    failure: false,
  }
  const guard = () => {
    if (state.failure) {
      throw new Error('private SQL')
    }
  }
  const isMember = (row: ConversationRow, me: string) => row.userAId === me || row.userBId === me
  const unreadOf = (row: ConversationRow, me: string) =>
    state.messages.filter(
      (message) =>
        message.conversationId === row.id &&
        message.senderUserId !== me &&
        !message.deletedAt &&
        message.id > (lastReadBy(row, me) ?? 0n)
    ).length
  const summaryOf = (row: ConversationRow, me: string): ConversationSummary => ({
    ...row,
    unreadCount: unreadOf(row, me),
    lastMessage:
      [...state.messages].reverse().find((message) => message.conversationId === row.id) ?? null,
  })

  const conversations: ConversationsRepository = {
    async findOrCreate(userAId, userBId) {
      guard()
      const existing = state.conversations.find(
        (row) => row.userAId === userAId && row.userBId === userBId
      )
      if (existing) {
        return { row: existing, created: false }
      }
      const row: ConversationRow = {
        id: randomUUID(),
        userAId,
        userBId,
        lastReadAMessageId: null,
        lastReadBMessageId: null,
        lastMessageAt: null,
        createdAt: new Date(Date.UTC(2026, 0, 1)),
      }
      state.conversations.push(row)
      return { row, created: true }
    },
    async findForMember(id, me) {
      guard()
      return state.conversations.find((row) => row.id === id && isMember(row, me)) ?? null
    },
    async summary(id, me) {
      guard()
      const row = state.conversations.find((item) => item.id === id && isMember(item, me))
      return row ? summaryOf(row, me) : null
    },
    async list(me, { page, pageSize }) {
      guard()
      const mine = state.conversations
        .filter((row) => isMember(row, me))
        .sort((x, y) => (y.lastMessageAt?.getTime() ?? -1) - (x.lastMessageAt?.getTime() ?? -1))
      const rows = mine.slice((page - 1) * pageSize, page * pageSize)
      return { rows: rows.map((row) => summaryOf(row, me)), total: mine.length }
    },
    async unreadTotal(me) {
      guard()
      return state.conversations
        .filter((row) => isMember(row, me))
        .reduce((total, row) => total + unreadOf(row, me), 0)
    },
    async markRead(row, me, upTo) {
      guard()
      const target = state.conversations.find((item) => item.id === row.id)!
      const side = target.userAId === me ? 'lastReadAMessageId' : 'lastReadBMessageId'
      if ((target[side] ?? 0n) < upTo) {
        target[side] = upTo
      }
    },
  }

  const messages: MessagesRepository = {
    async insert(conversationId, senderUserId, body) {
      guard()
      const id = state.nextId++
      const message: MessageRow = {
        id,
        conversationId,
        senderUserId,
        body,
        createdAt: new Date(Date.UTC(2026, 0, 1) + Number(id) * 1000),
        deletedAt: null,
      }
      state.messages.push(message)
      state.conversations.find((row) => row.id === conversationId)!.lastMessageAt =
        message.createdAt
      return message
    },
    async page(conversationId, { before, after, limit }) {
      guard()
      const found = state.messages
        .filter((message) => message.conversationId === conversationId)
        .filter((message) => (before === undefined ? true : message.id < before))
        .filter((message) => (after === undefined ? true : message.id > after))
        .sort((x, y) => Number(after === undefined ? y.id - x.id : x.id - y.id))
      return { rows: found.slice(0, limit), hasMore: found.length > limit }
    },
    async softDelete(conversationId, id, senderUserId) {
      guard()
      const message = state.messages.find(
        (item) =>
          item.id === id &&
          item.conversationId === conversationId &&
          item.senderUserId === senderUserId
      )
      if (message && !message.deletedAt) {
        message.deletedAt = new Date(Date.UTC(2026, 0, 2))
      }
      return message ?? null
    },
    async belongs(conversationId, id) {
      guard()
      return state.messages.some((item) => item.id === id && item.conversationId === conversationId)
    },
  }

  return { conversations, messages, state }
}

/**
 * @brief Construit un serveur de test, avec Alice et Bob déjà amis.
 * @param overrides Fausses dépendances que le test veut remplacer.
 * @returns Le serveur, la fonction `bearer` qui fabrique l'en-tête de connexion d'un compte donné, les
 *   fausses dépendances (`chat`, `users`), le vrai `hub`, `clock`, l'horloge des tickets (un test
 *   avance le temps en modifiant `clock.now`), `sockets`, la liste des WebSocket ouverts par le test,
 *   et `close`, qui arrête tout. Utilise `close` à la place de `app.close` dès qu'un test ouvre un
 *   WebSocket : voir sa description.
 */
export async function buildTestApp(overrides: Partial<Dependencies> = {}) {
  const chat = createFakeChat()
  const users = createFakeUsers()
  users.befriend(alice, bob)
  const hub = createHub({ pingIntervalMs: 60_000 })
  const clock = { now: 1_000_000 }
  const tickets = createTicketsService({ now: () => clock.now })
  const app = await buildApp(
    { jwtSecret },
    {
      conversations: chat.conversations,
      messages: chat.messages,
      users: users.client,
      hub,
      tickets,
      ready: async () => undefined,
      logger: false,
      ...overrides,
    }
  )
  await app.ready()
  const bearer = (subject: unknown) => ({
    authorization: `Bearer ${app.jwt.sign({ sub: subject })}`,
  })
  const sockets: WebSocket[] = []
  /**
   * @brief Arrête le serveur de test, après avoir coupé net les WebSocket du test.
   * @details Sans cela, le test se termine correctement mais le processus attend ~30 secondes : quand
   *   le serveur ferme poliment une connexion, la bibliothèque `ws` attend la réponse du client avant
   *   de libérer son minuteur, et une connexion simulée en mémoire ne répond jamais comme le ferait
   *   une vraie connexion réseau.
   */
  const close = async () => {
    sockets.forEach((socket) => socket.terminate())
    await app.close()
  }
  return { app, bearer, chat, users, hub, clock, sockets, close }
}

/** @brief Le serveur de test et ses outils, tels que `buildTestApp` les renvoie. */
export type TestApp = Awaited<ReturnType<typeof buildTestApp>>

/**
 * @brief Ouvre la conversation entre deux comptes et renvoie son identifiant.
 * @param test Serveur de test.
 * @param from Compte qui ouvre la conversation.
 * @param to Compte avec qui il discute.
 * @returns L'identifiant de la conversation.
 */
export async function openConversation({ app, bearer }: TestApp, from: string, to: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/conversations',
    headers: bearer(from),
    payload: { peerUserId: to },
  })
  return response.json().id as string
}

/**
 * @brief Envoie un message au nom d'un compte.
 * @param test Serveur de test.
 * @param from Expéditeur.
 * @param conversationId Conversation visée.
 * @param body Texte du message.
 * @returns La réponse HTTP complète.
 */
export function sendMessage(
  { app, bearer }: TestApp,
  from: string,
  conversationId: string,
  body: string
) {
  return app.inject({
    method: 'POST',
    url: `/conversations/${conversationId}/messages`,
    headers: bearer(from),
    payload: { body },
  })
}
