/**
 * @file errors.ts
 * @brief Liste des refus que playback-service peut opposer à une demande.
 *
 * @details Chaque refus est une petite fonction au nom parlant, qui fabrique l'erreur
 *   correspondante. Le code qui détecte le problème écrit `throw sessionNotFound()` : on lit
 *   immédiatement ce qui se passe, et le statut HTTP comme le code renvoyé au client ne sont
 *   définis qu'à un seul endroit, ici.
 */

import { DomainError } from '@ft/service-kit'

/**
 * @brief Crée l'erreur « session d'écoute introuvable » : réponse `404 session_not_found`.
 * @details Elle est aussi renvoyée quand la session existe mais appartient à un autre compte : un
 *   utilisateur ne peut ainsi pas savoir si une session qui n'est pas la sienne existe.
 */
export const sessionNotFound = () => new DomainError(404, 'session_not_found')
/**
 * @brief Crée l'erreur « ce morceau n'existe pas dans le catalogue, ou n'est pas publié » : réponse
 *   `404 track_not_found`.
 */
export const trackNotFound = () => new DomainError(404, 'track_not_found')
/**
 * @brief Crée l'erreur « cet événement de progression ne peut pas être accepté » : réponse `409
 *   progress_conflict`.
 * @details Elle couvre quatre cas : la session est déjà fermée ; le numéro de l'événement n'est pas
 *   celui attendu ; le temps d'écoute déclaré est plus petit que le précédent ; un événement déjà
 *   reçu est renvoyé avec un contenu différent.
 */
export const progressConflict = () => new DomainError(409, 'progress_conflict')
