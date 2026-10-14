/**
 * @file files.service.ts
 * @brief Lecture des fichiers : écoute publique d'un morceau, liste de ses propres fichiers, et
 *   aperçu privé d'un fichier.
 *
 * @details Deux sortes de lecture existent. La lecture publique sert le fichier audio d'un morceau
 *   à n'importe quel visiteur, à condition que le catalogue confirme que ce morceau est publié. La
 *   lecture privée est réservée au propriétaire du fichier : elle lui permet de revoir une image ou
 *   de réécouter l'aperçu MP3 d'un audio dans sa page de gestion.
 */

import type { Pagination } from '@ft/service-kit'
import type { CatalogClient } from '../clients/catalog.client.js'
import { fileNotFound, mediaNotFound } from '../domain/errors.js'
import {
  isManagedPurpose,
  isSafeStorageKey,
  toPublicFile,
  type StoredFile,
} from '../domain/file.js'
import { audioByteLimit, imageByteLimit } from '../domain/limits.js'
import type { AssetsRepository } from '../repositories/assets.repository.js'
import { openStoredFile, type OpenedFile } from '../storage/stored-file.js'

/**
 * @brief Type de l'objet renvoyé par `createFilesService`, c'est-à-dire la liste de ses opérations.
 */
export type FilesService = ReturnType<typeof createFilesService>

/** @brief Un fichier ouvert, prêt à être envoyé, accompagné du type à annoncer au navigateur. */
export type ReadableFile = OpenedFile & { mimeType: string }

/** @brief Partie du repository dont ce service a besoin. */
type Store = Pick<AssetsRepository, 'find' | 'findOwned' | 'list'>
/**
 * @brief Ce dont le service a besoin : le dossier de stockage, le repository et le client du
 *   catalogue.
 */
type Options = {
  /** @brief Dossier du volume. */
  storageDir: string
  /** @brief Métadonnées des fichiers. */
  assets: Store
  /** @brief Question « cet audio est-il publié ? ». */
  catalog: Pick<CatalogClient, 'isAssetPublished'>
}

/** @brief Types de fichiers audio que la route publique accepte de servir. */
const publicAudioTypes = ['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/webm']
/** @brief Types d'images que la lecture privée accepte de servir. */
const previewImageTypes = ['image/png', 'image/jpeg', 'image/webp']

/**
 * @brief Vérifie, à partir des seules informations en base, qu'un fichier peut être servi comme
 *   audio public.
 * @details Ce contrôle peu coûteux est fait en premier : inutile d'interroger le catalogue ou
 *   d'ouvrir le disque pour un fichier qui n'est de toute façon pas servable.
 * @param asset Fichier lu en base.
 * @returns Vrai si c'est un audio dans l'état `ready`, de nom sûr, de type et de taille acceptés.
 */
function isPublicAudio(asset: StoredFile): boolean {
  const { byteSize } = asset
  const hasUsableSize =
    byteSize !== null && byteSize > 0n && byteSize <= BigInt(Number.MAX_SAFE_INTEGER)
  return (
    asset.purpose === 'audio' &&
    asset.state === 'ready' &&
    isSafeStorageKey(asset.storageKey) &&
    publicAudioTypes.includes(asset.mimeType) &&
    hasUsableSize
  )
}

/**
 * @brief Crée le service de lecture.
 * @param options Dossier de stockage, repository et client du catalogue.
 * @returns Un objet offrant `list`, `openPublicAudio` et `openPrivateContent`.
 */
export function createFilesService({ storageDir, assets, catalog }: Options) {
  return {
    /**
     * @brief Renvoie une page des fichiers de l'utilisateur connecté.
     * @param owner Identifiant de l'utilisateur connecté.
     * @param pagination Numéro de page et nombre de fichiers par page.
     * @returns La page de fichiers, réduits à leurs informations publiques.
     */
    async list(owner: string, pagination: Pagination) {
      const { items, total } = await assets.list(owner, pagination)
      return { items: items.map(toPublicFile), total, ...pagination }
    },

    /**
     * @brief Ouvre le fichier audio d'un morceau publié, pour l'envoyer au lecteur.
     * @param id Identifiant du fichier.
     * @returns Le fichier ouvert et son type. Celui qui appelle doit refermer le fichier.
     * @throws {DomainError} `404 media_not_found` dans tous les cas de refus (fichier inconnu, non
     *   audio, absent du disque, morceau non publié) : la réponse ne révèle pas lequel.
     */
    async openPublicAudio(id: string): Promise<ReadableFile> {
      const asset = await assets.find(id)
      if (!asset || !isPublicAudio(asset)) {
        throw mediaNotFound()
      }
      if (!(await catalog.isAssetPublished(id))) {
        throw mediaNotFound()
      }
      const opened = await openStoredFile(storageDir, {
        storageKey: asset.storageKey,
        byteSize: asset.byteSize,
        maxBytes: Number.MAX_SAFE_INTEGER,
      })
      if (!opened) {
        throw mediaNotFound()
      }
      return { ...opened, mimeType: asset.mimeType }
    },

    /**
     * @brief Ouvre l'aperçu d'un fichier appartenant à l'utilisateur connecté.
     * @param owner Identifiant de l'utilisateur connecté.
     * @param id Identifiant du fichier.
     * @returns Pour une image, l'image elle-même ; pour un audio, son aperçu MP3.
     * @throws {DomainError} `404 file_not_found` si le fichier n'existe pas, appartient à un autre
     *   compte ou n'a pas d'aperçu lisible.
     */
    async openPrivateContent(owner: string, id: string): Promise<ReadableFile> {
      const asset = await assets.findOwned(owner, id)
      const isReadable =
        asset?.uploaderUserId === owner &&
        asset.state === 'ready' &&
        isManagedPurpose(asset.purpose)
      if (!asset || !isReadable) {
        throw fileNotFound()
      }
      const isAudio = asset.purpose === 'audio'
      const content = isAudio ? asset.variants[0] : asset
      const hasExpectedType = isAudio
        ? content?.mimeType === 'audio/mpeg'
        : previewImageTypes.includes(content?.mimeType ?? '')
      if (!content || !hasExpectedType) {
        throw fileNotFound()
      }
      const opened = await openStoredFile(storageDir, {
        storageKey: content.storageKey,
        byteSize: content.byteSize,
        maxBytes: isAudio ? audioByteLimit : imageByteLimit,
      })
      if (!opened) {
        throw fileNotFound()
      }
      return { ...opened, mimeType: content.mimeType }
    },
  }
}
