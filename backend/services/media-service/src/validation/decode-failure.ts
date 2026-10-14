/**
 * @file decode-failure.ts
 * @brief Type d'erreur utilisé par le programme de décodage isolé.
 *
 * @details Le dossier `validation/` contient tout ce qui vérifie le contenu réel d'un fichier
 *   envoyé. Une partie de ce code s'exécute dans un programme séparé du serveur (voir
 *   decode-file.ts). Ce fichier fait partie de cette moitié isolée : il ne doit rien importer du
 *   serveur web.
 */

// Chargé par le processus de décodage isolé : aucune dépendance au serveur HTTP.

/**
 * @brief Refus prononcé pendant le décodage d'un fichier.
 * @details Il porte le statut HTTP et le code que le serveur devra renvoyer au client.
 */
export class DecodeFailure extends Error {
  /**
   * @brief Construit un refus de décodage.
   * @param status Statut HTTP que le serveur renverra.
   * @param code Code du refus envoyé au client.
   */
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code)
  }
}

/**
 * @brief Crée le refus générique `415 invalid_file` : le fichier n'est pas lisible ou n'est pas ce
 *   qu'il prétend être.
 */
export const invalidFile = () => new DecodeFailure(415, 'invalid_file')
