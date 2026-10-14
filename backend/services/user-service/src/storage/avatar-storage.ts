/**
 * @file avatar-storage.ts
 * @brief Écriture et lecture des images d'avatar sur le disque.
 *
 * @details Les images ne sont pas stockées en base de données mais comme de simples fichiers dans
 *   un dossier. Ce dossier est un volume Docker, ce qui permet aux fichiers de survivre au
 *   redémarrage du conteneur. La base ne garde que l'adresse de l'avatar.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * @brief Type de l'objet renvoyé par `createAvatarStorage` : préparer le dossier, écrire un
 *   fichier, lire un fichier.
 */
export type AvatarStorage = ReturnType<typeof createAvatarStorage>

/**
 * @brief Crée le stockage des avatars.
 * @details Les noms de fichier reçus ici doivent déjà avoir été vérifiés (voir `isAvatarFileName`
 *   dans domain/avatar.ts) : ce fichier ne refait pas ce contrôle.
 * @param directory Chemin du dossier où ranger les avatars.
 * @returns Un objet offrant `prepare`, `write` et `read`.
 */
export function createAvatarStorage(directory: string) {
  return {
    /**
     * @brief Crée le dossier des avatars s'il n'existe pas. Appelée une fois, au démarrage du
     *   service.
     */
    async prepare(): Promise<void> {
      await mkdir(directory, { recursive: true })
    },

    /**
     * @brief Écrit une image d'avatar sur le disque.
     * @param fileName Nom du fichier, fabriqué par le serveur.
     * @param bytes Contenu de l'image.
     */
    async write(fileName: string, bytes: Buffer): Promise<void> {
      await writeFile(join(directory, fileName), bytes)
    },

    /**
     * @brief Lit une image d'avatar sur le disque.
     * @param fileName Nom du fichier, déjà vérifié.
     * @returns Le contenu de l'image, ou null si aucun fichier ne porte ce nom.
     */
    async read(fileName: string): Promise<Buffer | null> {
      try {
        return await readFile(join(directory, fileName))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null
        }
        throw error
      }
    },
  }
}
