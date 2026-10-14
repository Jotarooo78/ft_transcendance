/**
 * @file errors.ts
 * @brief Liste des refus que user-service peut opposer à une demande.
 *
 * @details Chaque refus est une petite fonction au nom parlant. Le code qui détecte le problème
 *   écrit par exemple `throw profileNotFound()`, et le client reçoit le statut HTTP et le message
 *   définis ici, sous la forme `{ "error": "profile not found" }`.
 *
 * Particularité de ce service : le texte anglais de chaque erreur est affiché tel quel par le
 * frontend et comparé tel quel par les tests. Il ne faut donc pas le modifier. C'est aussi pour
 * cela que les données saisies sont vérifiées à la main dans `domain/` et non par des schémas : un
 * schéma répondrait le même message générique pour toutes les erreurs.
 */

import { DomainError } from '@ft/service-kit'

// Les textes de ce fichier font partie du contrat : le frontend et les tests les comparent tels quels.

/**
 * @brief Fabrique une fonction qui crée toujours la même erreur.
 * @details Elle évite de répéter `new DomainError(...)` à chaque ligne de ce fichier.
 * @param status Statut HTTP de la réponse.
 * @param message Texte envoyé au client.
 * @returns Une fonction sans paramètre qui renvoie l'erreur.
 */
const refusal = (status: number, message: string) => () => new DomainError(status, message)

/** @brief Erreur 404 : ce compte n'a pas de profil. */
export const profileNotFound = refusal(404, 'profile not found')
/** @brief Erreur 400 : l'identifiant de compte reçu dans l'URL n'a pas le format attendu. */
export const invalidUserId = refusal(400, 'invalid user id')
/** @brief Erreur 400 : le nom affiché est vide ou dépasse 60 caractères. */
export const invalidDisplayName = refusal(400, 'displayName must be between 1 and 60 chars')
/**
 * @brief Erreur 400 : le username ne fait pas 3 à 24 caractères parmi les lettres minuscules, les
 *   chiffres et `_`.
 */
export const invalidUsername = refusal(400, 'username must match ^[a-z0-9_]{3,24}$')
/** @brief Erreur 400 : la bio est absente, n'est pas un texte, ou dépasse 160 caractères. */
export const invalidBio = refusal(400, 'bio must be null or contain no more than 160 chars')
/** @brief Erreur 409 : ce username est déjà utilisé par un autre compte. */
export const usernameInUse = refusal(409, 'username already in use')

/** @brief Erreur 400 : la requête d'envoi d'avatar n'est pas un formulaire avec fichier. */
export const avatarFileRequired = refusal(400, 'avatar file is required')
/** @brief Erreur 400 : le formulaire ne contient pas de champ nommé `avatar`. */
export const avatarFieldRequired = refusal(400, 'avatar field is required')
/** @brief Erreur 415 : le type d'image annoncé n'est ni PNG, ni JPEG, ni WebP. */
export const unsupportedAvatarType = refusal(415, 'unsupported avatar mime type')
/** @brief Erreur 415 : le contenu du fichier n'est pas une image du type annoncé. */
export const avatarTypeMismatch = refusal(
  415,
  'avatar content does not match its declared mime type'
)
/** @brief Erreur 413 : l'image dépasse 2 Mio. */
export const avatarTooLarge = refusal(413, 'avatar must not exceed 2 MiB')
/** @brief Erreur 400 : le nom de fichier demandé n'a pas le format des avatars du service. */
export const invalidAvatarName = refusal(400, 'invalid file name')
/** @brief Erreur 404 : aucun avatar ne porte ce nom. */
export const avatarNotFound = refusal(404, 'avatar not found')

/** @brief Erreur 400 : l'identifiant d'ami reçu dans l'URL n'a pas le format attendu. */
export const invalidFriendId = refusal(400, 'invalid friend id')
/** @brief Erreur 400 : un utilisateur ne peut pas s'ajouter lui-même en ami. */
export const cannotAddYourself = refusal(400, 'cannot add yourself')
/** @brief Erreur 404 : le compte à ajouter en ami n'a pas de profil. */
export const friendNotFound = refusal(404, 'friend profile not found')

/** @brief Erreur 400 : la demande de création de profil envoyée par auth-service est mal formée. */
export const invalidProvisionCommand = refusal(400, 'invalid profile provision command')
/**
 * @brief Crée l'erreur « username déjà pris » lors de la création d'un profil demandée par
 *   auth-service.
 * @details Le code `USERNAME_TAKEN` indique à auth-service que le refus est définitif : renvoyer la
 *   même demande ne servira à rien.
 * @returns Une erreur 409.
 */
export const usernameTaken = () =>
  new DomainError(409, 'username already registered', { code: 'USERNAME_TAKEN' })
/**
 * @brief Crée l'erreur « ce compte a déjà un profil, créé par une autre demande ».
 * @details Comme `USERNAME_TAKEN`, c'est un refus définitif pour auth-service.
 * @returns Une erreur 409 de code `PROFILE_CONFLICT`.
 */
export const profileConflict = () =>
  new DomainError(409, 'profile already exists for another command', { code: 'PROFILE_CONFLICT' })
