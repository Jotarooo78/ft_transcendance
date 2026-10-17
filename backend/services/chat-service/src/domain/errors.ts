/**
 * @file errors.ts
 * @brief Les refus prévus de chat-service, un par situation.
 *
 * @details Une `DomainError` est un refus normal du métier (« cette conversation n'existe pas pour
 *   vous »), par opposition à une panne. Elle porte le statut HTTP et le code à renvoyer au client,
 *   sous la forme `{ "error": "<code>" }`. Il suffit de la lever (`throw`) : le plugin d'erreurs du
 *   paquet partagé la transforme en réponse, aucun `try/catch` n'est nécessaire.
 *
 * Les codes de ce fichier font partie du contrat avec le frontend : ne les change pas sans le lui
 * dire.
 */

import { DomainError } from '@ft/service-kit'

/**
 * @brief Crée l'erreur « cette conversation n'existe pas, ou vous n'en faites pas partie » : réponse
 *   `404 conversation_not_found`.
 * @details On répond la même chose dans les deux cas, pour qu'un inconnu qui devine un identifiant
 *   n'apprenne même pas que la conversation existe.
 */
export const conversationNotFound = () => new DomainError(404, 'conversation_not_found')

/**
 * @brief Crée l'erreur « ce message n'existe pas, n'est pas dans cette conversation, ou n'est pas à
 *   vous » : réponse `404 message_not_found`.
 */
export const messageNotFound = () => new DomainError(404, 'message_not_found')

/**
 * @brief Crée l'erreur « vous n'êtes pas amis avec cette personne » : réponse `403 not_friends`.
 * @details Levée à l'ouverture d'une conversation et à chaque envoi de message, y compris dans une
 *   conversation existante : si l'amitié est supprimée, l'envoi est refusé mais l'historique reste
 *   lisible.
 */
export const notFriends = () => new DomainError(403, 'not_friends')

/** @brief Crée l'erreur « on ne peut pas discuter avec soi-même » : réponse `400`. */
export const cannotChatWithYourself = () => new DomainError(400, 'cannot_chat_with_yourself')

/**
 * @brief Crée l'erreur « le texte du message est vide ou trop long » : réponse `400
 *   invalid_message`.
 */
export const invalidMessage = () => new DomainError(400, 'invalid_message')

/**
 * @brief Crée l'erreur « le service ne peut pas répondre pour le moment » : réponse `503
 *   chat_unavailable`, la même que celle d'une panne imprévue.
 */
export const chatUnavailable = () => new DomainError(503, 'chat_unavailable')

/**
 * @brief Crée l'erreur « ce morceau n'existe pas dans le catalogue, ou n'est pas publié » : réponse
 *   `404 track_not_found`.
 * @details Levée quand on partage un morceau en brouillon, retiré, ou dont l'identifiant est inventé.
 */
export const trackNotFound = () => new DomainError(404, 'track_not_found')
