/**
 * @file errors.ts
 * @brief Liste des refus que media-service peut opposer à une demande.
 *
 * @details Chaque refus est une petite fonction au nom parlant, qui fabrique l'erreur
 *   correspondante avec son statut HTTP et son code. Le code qui détecte le problème écrit par
 *   exemple `throw fileNotFound()`.
 */

import { DomainError } from '@ft/service-kit'

/**
 * @brief Fabrique un refus de fichier à partir d'un statut HTTP et d'un code.
 * @param status Statut HTTP de la réponse.
 * @param code Code envoyé au client, par exemple `file_too_large`.
 * @returns L'erreur correspondante.
 */
export const fileError = (status: number, code: string) => new DomainError(status, code)

/** @brief Crée l'erreur `404 media_not_found` : aucun fichier audio public à cette adresse. */
export const mediaNotFound = () => fileError(404, 'media_not_found')
/**
 * @brief Crée l'erreur `404 file_not_found` : fichier personnel introuvable.
 * @details Elle est aussi renvoyée quand le fichier existe mais appartient à un autre compte : un
 *   utilisateur ne peut ainsi pas savoir si un fichier qui n'est pas le sien existe.
 */
export const fileNotFound = () => fileError(404, 'file_not_found')
/**
 * @brief Crée l'erreur `409 file_in_use` : le fichier est encore utilisé par un morceau, un album
 *   ou un artiste du catalogue, et ne peut donc pas être supprimé.
 */
export const fileInUse = () => fileError(409, 'file_in_use')
/**
 * @brief Crée l'erreur `503 upload_busy` : un autre envoi de fichier est déjà en cours sur le
 *   service.
 */
export const uploadBusy = () => fileError(503, 'upload_busy')
/**
 * @brief Crée l'erreur `503 file_storage_unavailable` : le disque ou la base ne permet pas de
 *   terminer l'opération.
 */
export const storageUnavailable = () => fileError(503, 'file_storage_unavailable')
