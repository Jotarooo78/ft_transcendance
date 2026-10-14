/**
 * @file domain-error.ts
 * @brief L'erreur métier, commune à tous les services.
 *
 * @details Il y a deux sortes d'échecs dans un serveur. Les premiers sont prévus et normaux : la
 *   playlist demandée n'existe pas, le fichier est trop gros, le nom d'utilisateur est déjà pris.
 *   Les seconds sont des pannes : la base ne répond plus, le code a un bogue.
 *
 * Une `DomainError` représente un échec de la première sorte. Elle contient le statut HTTP et le
 * code à renvoyer au client. Le code qui détecte le problème fait simplement `throw` ; le serveur
 * se charge d'en faire une réponse propre (voir plugins/errors.ts). Tout ce qui n'est pas une
 * `DomainError` est traité comme une panne.
 */

/**
 * @brief Erreur qui représente un refus prévu, à renvoyer tel quel au client.
 * @details Exemple : `throw new DomainError(404, 'playlist_not_found')` produit la réponse HTTP
 *   `404 { "error": "playlist_not_found" }`. Les services ne créent pas ces erreurs n'importe où :
 *   chacun a un fichier `domain/errors.ts` qui en donne la liste, avec un nom parlant pour chacune.
 */
export class DomainError extends Error {
  /**
   * @brief Crée une erreur métier.
   * @param status Statut HTTP de la réponse : 400 (demande invalide), 404 (introuvable), 409
   *   (conflit)…
   * @param code Texte placé dans le champ `error` de la réponse. Le frontend s'en sert pour savoir
   *   quoi afficher.
   * @param details Champs supplémentaires à ajouter à la réponse, quand le contrat en prévoit. Par
   *   exemple `{ code: 'USERNAME_TAKEN' }` donne `{ "error": "...", "code": "USERNAME_TAKEN" }`.
   */
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(code)
    this.name = 'DomainError'
  }
}

/**
 * @brief Crée l'erreur « la demande est invalide ».
 * @details La plupart des demandes invalides sont refusées automatiquement par les schémas de
 *   validation. Cette fonction sert pour les règles qu'un schéma ne sait pas exprimer, par exemple
 *   « le nom, une fois les espaces retirés, fait entre 1 et 100 caractères ». Le résultat est
 *   identique pour le client : `400 { "error": "invalid_request" }`.
 * @returns L'erreur à lever avec `throw`.
 */
export const invalidRequest = () => new DomainError(400, 'invalid_request')
