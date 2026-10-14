/**
 * @file avatars.service.ts
 * @brief Règles métier des avatars : enregistrer une nouvelle image de profil et relire une image
 *   existante.
 */

import { randomUUID } from 'node:crypto'
import {
  avatarContentType,
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
  unsupportedAvatarType,
} from '../domain/errors.js'
import { toProfile, type Profile } from '../domain/profile.js'
import type { ProfilesRepository } from '../repositories/profiles.repository.js'
import type { AvatarStorage } from '../storage/avatar-storage.js'

/** @brief Type de l'objet renvoyé par `createAvatarsService` : les opérations `save` et `read`. */
export type AvatarsService = ReturnType<typeof createAvatarsService>

/**
 * @brief Crée le service des avatars.
 * @param profiles Repository des profils, pour enregistrer l'adresse de l'avatar.
 * @param storage Stockage des fichiers sur le disque.
 * @returns Un objet offrant `save` et `read`.
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
  }
}
