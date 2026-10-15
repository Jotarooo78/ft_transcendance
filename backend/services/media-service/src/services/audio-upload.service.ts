/** Ajoute la pochette facultative à un audio durablement reçu, sans invalider l’audio si l’image échoue. */
import { join } from 'node:path'
import type { CoverStore } from '../domain/cover.js'
import { toPublicCover, toPublicFile } from '../domain/file.js'
import { extractAudioCover } from '../validation/extract-audio-cover.js'
import { saveAudioCover } from './save-audio-cover.js'
import type { UploadService } from './upload.service.js'
/** Coordonne l’envoi et l’extraction sous le budget total de traitement, avec expiration facultative. */
export function createAudioUploadService(
  storageDir: string,
  uploads: UploadService,
  covers: CoverStore
) {
  return {
    /** Le délai de 24 h est enregistré atomiquement avec l’audio ; seule la pochette est facultative. */
    async save(
      owner: string,
      receive: (path: string) => Promise<string>,
      signal: AbortSignal,
      temporary: boolean
    ) {
      let started = Date.now()
      const audio = await uploads.save(
        owner,
        async (path) => {
          const mime = await receive(path)
          started = Date.now()
          return mime
        },
        signal,
        temporary ? new Date(Date.now() + 86_400_000) : undefined
      )
      try {
        const cover = await saveAudioCover(storageDir, audio.id, owner, covers, (path) =>
          extractAudioCover(join(storageDir, audio.storageKey), path, {
            timeMs: Math.max(0, 300_000 - (Date.now() - started)),
            signal,
          })
        )
        return { ...toPublicFile(audio), cover: cover ? toPublicCover(cover) : null }
      } catch {
        return { ...toPublicFile(audio), warning: 'cover_unavailable' as const }
      }
    },
  }
}
/** Opération d’envoi injectée dans le contrôleur HTTP. */
export type AudioUploadService = ReturnType<typeof createAudioUploadService>
