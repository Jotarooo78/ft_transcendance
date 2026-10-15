/** Modification des pochettes et lecture privée ou publique, avec contrôle du propriétaire ou du catalogue. */
import type { CoverStore } from '../domain/cover.js'
import { fileNotFound, fileError } from '../domain/errors.js'
import { toPublicCover } from '../domain/file.js'
import { imageByteLimit } from '../domain/limits.js'
import type { AssetsRepository } from '../repositories/assets.repository.js'
import type { CatalogClient } from '../clients/catalog.client.js'
import type { FileValidator } from '../validation/validate-file.js'
import { openStoredFile } from '../storage/stored-file.js'
import { saveAudioCover, cleanRetiredCovers } from './save-audio-cover.js'
/** Injecte stockage, validation et accès SQL ; les opérations HTTP restent dans le contrôleur. */
export function createCoversService(
  storageDir: string,
  assets: AssetsRepository,
  covers: CoverStore,
  catalog: CatalogClient,
  validate: FileValidator
) {
  return {
    /** Une image manuelle remplace seulement la pochette d’un audio prêt du compte. */
    async replace(
      owner: string,
      id: string,
      receive: (path: string) => Promise<string>,
      signal: AbortSignal
    ) {
      const asset = await assets.findOwned(owner, id)
      if (!asset || asset.state !== 'ready' || asset.purpose !== 'audio') throw fileNotFound()
      const cover = await saveAudioCover(storageDir, id, owner, covers, async (path) => {
        const mime = await receive(path)
        const image = await validate(path, mime, { signal })
        if (image.purpose !== 'image') throw fileError(415, 'image_required')
        if (signal.aborted) throw fileError(400, 'upload_aborted')
        return image
      })
      return { cover: toPublicCover(cover!) }
    },
    /** Détache une pochette ; le nettoyage durable pourra être repris après une panne. */
    async remove(owner: string, id: string) {
      await covers.remove(id, owner)
    },
    /** Retire seulement les variantes déjà détachées. */
    cleanup() {
      return cleanRetiredCovers(storageDir, covers)
    },
    /** Ouvre une image privée du compte, ou publique si son audio est publié ; borne lecture et type. */
    async open(id: string, owner?: string) {
      if (owner === undefined && !(await catalog.isAssetPublished(id))) throw fileNotFound()
      const asset = owner === undefined ? await assets.find(id) : await assets.findOwned(owner, id)
      const cover = asset?.variants?.find((v) => v.renditionKey === 'cover')
      if (
        !asset ||
        asset.state !== 'ready' ||
        asset.purpose !== 'audio' ||
        !cover ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(cover.mimeType)
      )
        throw fileNotFound()
      const opened = await openStoredFile(storageDir, {
        storageKey: cover.storageKey,
        byteSize: cover.byteSize,
        maxBytes: imageByteLimit,
      })
      if (!opened) throw fileNotFound()
      return { ...opened, mimeType: cover.mimeType }
    },
  }
}
/** Contrat des opérations disponibles pour les routes de pochette. */
export type CoversService = ReturnType<typeof createCoversService>
