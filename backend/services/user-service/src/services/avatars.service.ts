/**
 * @file avatars.service.ts
 * @brief Règles métier des avatars : enregistrer une nouvelle image de profil, la relire et la
 *   supprimer.
 */

import { randomUUID } from 'node:crypto'
import {
  avatarContentType,
  avatarFileNameOf,
  avatarFileName,
  avatarUrl,
  detectAvatarMimeType,
  isAvatarFileName,
  isAvatarMimeType,
} from '../domain/avatar.js'
import {
  avatarNotFound,
  avatarTypeMismatch,
  invalidAvatarName,
  profileNotFound,
  unsupportedAvatarType,
} from '../domain/errors.js'
import { toProfile, type Profile } from '../domain/profile.js'
import type { ProfilesRepository } from '../repositories/profiles.repository.js'
import type { AvatarStorage } from '../storage/avatar-storage.js'

/**
 * @brief Type de l'objet renvoyé par `createAvatarsService` : les opérations `save`, `read` et
 *   `remove`.
 */
export type AvatarsService = ReturnType<typeof createAvatarsService>

/**
 * @brief Crée le service des avatars.
 * @param profiles Repository des profils, pour enregistrer l'adresse de l'avatar.
 * @param storage Stockage des fichiers sur le disque.
 * @returns Un objet offrant `save`, `read` et `remove`.
 */
export function createAvatarsService(profiles: ProfilesRepository, storage: AvatarStorage) {
  return {
    /**
     * @brief Enregistre un nouvel avatar pour l'utilisateur connecté.
     * @details Étapes : 1) vérifier que le type annoncé est accepté ; 2) vérifier, en lisant le
     *   début du fichier, que le contenu est bien une image de ce type ; 3) fabriquer un nom de
     *   fichier ; 4) écrire le fichier sur le disque ; 5) enregistrer l'adresse de l'avatar dans le
     *   profil.
     * @param userId Identifiant de l'utilisateur connecté.
     * @param declaredMime Type d'image annoncé par le navigateur.
     * @param bytes Contenu du fichier.
     * @returns Le profil à jour, avec la nouvelle adresse d'avatar.
     * @throws {DomainError} 415 si le type n'est pas accepté ou si le contenu ne correspond pas au
     *   type annoncé.
     */
    async save(userId: string, declaredMime: string, bytes: Buffer): Promise<Profile> {
      if (!isAvatarMimeType(declaredMime)) {
        throw unsupportedAvatarType()
      }
      if (detectAvatarMimeType(bytes) !== declaredMime) {
        throw avatarTypeMismatch()
      }
      const fileName = avatarFileName(userId, randomUUID(), declaredMime)
      await storage.write(fileName, bytes)
      return toProfile(await profiles.setAvatar(userId, avatarUrl(fileName)))
    },

    /**
     * @brief Lit un avatar à partir de son nom de fichier.
     * @param fileName Nom reçu dans l'URL.
     * @returns Le contenu de l'image et le type à annoncer au navigateur.
     * @throws {DomainError} 400 `invalid file name` si le nom n'a pas le format attendu ; 404
     *   `avatar not found` si le fichier n'existe pas.
     */
    async read(fileName: string) {
      if (!isAvatarFileName(fileName)) {
        throw invalidAvatarName()
      }
      const bytes = await storage.read(fileName)
      if (bytes === null) {
        throw avatarNotFound()
      }
      return { bytes, contentType: avatarContentType(fileName) }
    },

    /**
     * @brief Supprime l'avatar de l'utilisateur connecté : le profil retrouve l'image par défaut.
     * @details Étapes : 1) lire le profil pour connaître l'adresse de l'avatar actuel ; 2) retirer
     *   cette adresse du profil en base ; 3) effacer le fichier du disque. La base est modifiée
     *   avant le disque : si l'effacement échoue, le profil n'affiche déjà plus l'image et il ne
     *   reste qu'un fichier orphelin, alors que l'ordre inverse laisserait un profil pointant vers
     *   un fichier disparu. Un profil sans avatar est un cas normal : la suppression est alors
     *   sans effet sur le disque et renvoie simplement le profil.
     * @param userId Identifiant de l'utilisateur connecté.
     * @returns Le profil à jour, avec `avatarUrl` à null.
     * @throws {DomainError} 404 `profile not found` si le compte n'a pas de profil.
     */
    async remove(userId: string): Promise<Profile> {
      const current = await profiles.find(userId)
      if (current === null) {
        throw profileNotFound()
      }
      const updated = await profiles.clearAvatar(userId)
      const fileName = avatarFileNameOf(current.avatarUrl, userId)
      if (fileName !== null) {
        await storage.remove(fileName)
      }
      return toProfile(updated)
    },
  }
}
