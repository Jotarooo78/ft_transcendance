/**
 * @file message.ts
 * @brief Règles et conversions d'un message : nettoyage du texte, lecture des curseurs d'historique,
 *   forme publique renvoyée au client.
 *
 * @details Ce fichier ne connaît ni HTTP ni la base : ce sont des fonctions pures, faciles à tester.
 *
 * Un message a un numéro entier croissant (`id`). C'est un `BIGINT` en base, donc un `bigint`
 * TypeScript (écrit `5n`). JSON ne sait pas transporter un `bigint` : on le convertit en nombre
 * ordinaire, après avoir vérifié qu'il est représentable exactement.
 */

import { invalidRequest } from '@ft/service-kit'
import { invalidMessage } from './errors.js'

/** @brief Nombre maximal de caractères d'un message, une fois les espaces autour retirés. */
export const maxBodyLength = 2000
/** @brief Nombre de messages renvoyés par page d'historique quand le client ne précise rien. */
export const defaultHistoryLimit = 30
/** @brief Nombre maximal de messages par page d'historique. */
export const maxHistoryLimit = 100

/** @brief Un message tel que la base le renvoie. */
export type MessageRow = {
  id: bigint
  conversationId: string
  senderUserId: string
  body: string
  createdAt: Date
  deletedAt: Date | null
}

/**
 * @brief Un message tel que le client le reçoit.
 * @details `body` vaut `null` quand le message a été supprimé : le texte n'est plus jamais renvoyé.
 */
export type Message = {
  id: number
  conversationId: string
  senderUserId: string
  body: string | null
  createdAt: string
  deletedAt: string | null
}

/** @brief Réglages d'une page d'historique, déjà vérifiés. */
export type HistoryOptions = { before?: bigint; after?: bigint; limit: number }

/**
 * @brief Convertit un `bigint` en nombre en vérifiant qu'aucune précision n'est perdue.
 * @param value Numéro lu en base.
 * @returns Le même numéro, en nombre ordinaire.
 * @throws {Error} Si le numéro dépasse 2^53 − 1. Ce n'est pas une erreur du client : c'est une panne,
 *   qui devient un `503`.
 */
export function toSafeNumber(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw new Error('Message id exceeds the safe integer range')
  }
  return number
}

/**
 * @brief Nettoie le texte d'un message et vérifie sa longueur.
 * @details Les espaces et retours à la ligne au début et à la fin sont retirés ; ceux du milieu sont
 *   conservés. La longueur se compte en caractères Unicode (`[...texte]`) et non avec `.length`,
 *   qui compterait un émoji pour deux : la base compte un émoji pour un.
 * @param raw Texte envoyé par le client.
 * @returns Le texte nettoyé.
 * @throws {DomainError} 400 `invalid_message` s'il est vide ou dépasse 2000 caractères.
 */
export function normalizeBody(raw: string): string {
  const body = raw.trim()
  const length = [...body].length
  if (length < 1 || length > maxBodyLength) {
    throw invalidMessage()
  }
  return body
}

/**
 * @brief Convertit un numéro de message reçu en texte (paramètre d'URL) en `bigint`.
 * @param text Chiffres uniquement : le schéma de la route l'a déjà garanti.
 * @returns Le numéro.
 * @throws {DomainError} 400 `invalid_request` s'il dépasse 2^53 − 1 : aucun message n'a un tel numéro.
 */
export function toMessageId(text: string): bigint {
  const number = Number(text)
  if (!Number.isSafeInteger(number)) {
    throw invalidRequest()
  }
  return BigInt(number)
}

/**
 * @brief Transforme les paramètres d'URL d'une page d'historique en réglages exploitables.
 * @param query `before`, `after` et `limit`, tous facultatifs et reçus en texte.
 * @returns Les réglages, avec `limit` borné à 100 et valant 30 par défaut.
 * @throws {DomainError} 400 `invalid_request` si `before` et `after` sont donnés ensemble, si
 *   `limit` est nul ou supérieur à 100, ou si un numéro est trop grand.
 */
export function toHistoryOptions(query: {
  before?: string
  after?: string
  limit?: string
}): HistoryOptions {
  if (query.before !== undefined && query.after !== undefined) {
    throw invalidRequest()
  }
  const limit = Number(query.limit ?? defaultHistoryLimit)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxHistoryLimit) {
    throw invalidRequest()
  }
  return {
    limit,
    ...(query.before === undefined ? {} : { before: toMessageId(query.before) }),
    ...(query.after === undefined ? {} : { after: toMessageId(query.after) }),
  }
}

/**
 * @brief Convertit un message de la base en message public.
 * @param row Ligne lue en base.
 * @returns Le message tel que le client le reçoit ; le texte est remplacé par `null` si le message est
 *   supprimé.
 */
export function toMessage(row: MessageRow): Message {
  return {
    id: toSafeNumber(row.id),
    conversationId: row.conversationId,
    senderUserId: row.senderUserId,
    body: row.deletedAt ? null : row.body,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  }
}
