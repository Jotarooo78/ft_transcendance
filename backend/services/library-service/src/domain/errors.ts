/**
 * @file errors.ts
 * @brief Liste des refus que library-service peut opposer à une demande.
 *
 * @details Chaque refus est une petite fonction au nom parlant, qui fabrique l'erreur
 *   correspondante. Le code qui détecte le problème écrit `throw playlistNotFound()` : on lit
 *   immédiatement ce qui se passe, et le statut HTTP comme le code renvoyé au client ne sont
 *   définis qu'à un seul endroit, ici.
 */

import { DomainError } from '@ft/service-kit'

/**
 * @brief Crée l'erreur « playlist introuvable » : réponse `404 playlist_not_found`.
 * @details Elle est aussi renvoyée quand la playlist existe mais appartient à un autre compte : un
 *   utilisateur ne peut ainsi pas savoir si une playlist qui n'est pas la sienne existe.
 */
export const playlistNotFound = () => new DomainError(404, 'playlist_not_found')
/**
 * @brief Crée l'erreur « cette occurrence n'est pas dans cette playlist » : réponse `404
 *   item_not_found`.
 */
export const itemNotFound = () => new DomainError(404, 'item_not_found')
/**
 * @brief Crée l'erreur « ce morceau n'existe pas dans le catalogue, ou n'est pas publié » : réponse
 *   `404 track_not_found`.
 */
export const trackNotFound = () => new DomainError(404, 'track_not_found')
/**
 * @brief Crée l'erreur « la playlist a changé depuis que vous l'avez lue » : réponse `409
 *   version_conflict`.
 * @details Le client doit recharger la playlist puis refaire sa modification.
 */
export const versionConflict = () => new DomainError(409, 'version_conflict')
/**
 * @brief Crée l'erreur « la playlist a atteint une limite technique » : réponse `409
 *   playlist_limit`.
 * @details Elle ne se produit que si le numéro de version ou de position atteint la plus grande
 *   valeur que la base peut stocker, ce qui n'arrive pas en usage normal.
 */
export const playlistLimit = () => new DomainError(409, 'playlist_limit')
