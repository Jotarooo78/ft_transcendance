/**
 * @file decode-image.ts
 * @brief Vérification d'une image envoyée.
 *
 * @details L'image est réellement décodée, pixel par pixel, avec la bibliothèque sharp. Un fichier
 *   qui porte l'extension `.png` mais dont le contenu est corrompu ou d'une autre nature est ainsi
 *   refusé.
 */

import sharp from 'sharp'
import type { ImageFormat } from '../domain/limits.js'
import { DecodeFailure, invalidFile } from './decode-failure.js'

sharp.cache(false)
sharp.concurrency(1)

/** @brief Plus grande largeur ou hauteur acceptée, en pixels. */
const maxSide = 8192
/** @brief Nombre total de pixels maximal accepté : 25 millions. */
const maxPixels = 25_000_000

/**
 * @brief Décode entièrement une image et vérifie ses dimensions.
 * @param path Chemin du fichier.
 * @param format Format reconnu d'après les premiers octets du fichier.
 * @param declaredMime Type annoncé par le navigateur lors de l'envoi.
 * @returns La nature (`image`), le type et les dimensions de l'image.
 * @throws {DecodeFailure} `415 mime_mismatch` si le type annoncé ne correspond pas au contenu ;
 *   `422 image_dimensions` si l'image est trop grande ; `415 invalid_file` si elle est animée,
 *   corrompue ou d'un autre format.
 */
export async function decodeImage(path: string, format: ImageFormat, declaredMime: string) {
  const mimeType = `image/${format}`
  if (declaredMime !== mimeType && declaredMime !== 'application/octet-stream') {
    throw new DecodeFailure(415, 'mime_mismatch')
  }
  // Les métadonnées se lisent sans allouer les pixels : les bornes sont vérifiées avant le décodage.
  const image = sharp(path, { failOn: 'warning', limitInputPixels: false, animated: true })
  const meta = await image.metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (!width || !height || width > maxSide || height > maxSide || width * height > maxPixels) {
    throw new DecodeFailure(422, 'image_dimensions')
  }
  if (meta.format !== format || (meta.pages ?? 1) !== 1) {
    throw invalidFile()
  }
  // stats parcourt chaque pixel décodé sans conserver l'image brute en mémoire.
  await image.stats()
  return { purpose: 'image' as const, mimeType, durationMs: null, width, height }
}
