/**
 * @file upload-gate.ts
 * @brief Garde-fou « un seul envoi de fichier à la fois ».
 *
 * @details Recevoir et décoder un fichier de plusieurs centaines de mégaoctets coûte cher en
 *   mémoire et en disque. Le service n'en traite donc qu'un seul à la fois. Si un second envoi
 *   arrive pendant ce temps, il est refusé tout de suite avec `503 upload_busy`, et le client peut
 *   réessayer.
 */

/** @brief Type de l'objet renvoyé par `createUploadGate`. */
export type UploadGate = ReturnType<typeof createUploadGate>

/**
 * @brief Crée le garde-fou.
 * @details C'est une simple variable en mémoire : elle vaut pour une instance du service.
 * @returns Un objet offrant `tryEnter` (prendre la place) et `leave` (la rendre).
 */
export function createUploadGate() {
  let receiving = false

  return {
    /**
     * @brief Prend la place si elle est libre.
     * @returns Vrai si la place a été prise ; faux si un envoi est déjà en cours.
     */
    tryEnter(): boolean {
      if (receiving) {
        return false
      }
      receiving = true
      return true
    },

    /** @brief Rend la place. Doit être appelée à la fin de chaque envoi, réussi ou non. */
    leave(): void {
      receiving = false
    },
  }
}
