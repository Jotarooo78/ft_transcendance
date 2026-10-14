/**
 * @file limits.ts
 * @brief Tailles maximales des fichiers acceptés, et reconnaissance d'une image à ses premiers
 *   octets.
 *
 * @details Un fichier audio peut peser jusqu'à 500 Mo, une image jusqu'à 25 Mo. Pour savoir si un
 *   fichier est une image, on ne regarde ni son nom ni son extension, que l'expéditeur choisit
 *   librement : on lit ses tout premiers octets, qui sont propres à chaque format (on parle de «
 *   signature »).
 *
 * Contrainte technique : ce fichier est aussi chargé par le programme de décodage isolé (voir
 * validation/decode-file.ts), qui doit rester minimal. Il ne doit donc importer aucun autre
 * fichier.
 */

// Ce fichier est aussi chargé par le processus de décodage isolé : il ne doit rien importer.

/** @brief Taille maximale d'un audio : 500 Mo décimaux. */
export const audioByteLimit = 500_000_000
/** @brief Taille maximale d'une image : 25 Mo décimaux. */
export const imageByteLimit = 25_000_000
/** @brief Nombre d'octets à lire en tête de fichier pour reconnaître une image. */
export const signatureLength = 12

/** @brief Les trois formats d'image acceptés. */
export type ImageFormat = 'png' | 'jpeg' | 'webp'

/** @brief Les huit premiers octets de tout fichier PNG, qui permettent de le reconnaître. */
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/**
 * @brief Reconnaît le format d'une image en lisant ses premiers octets.
 * @param header Début du fichier : au moins ses 12 premiers octets.
 * @returns `png`, `jpeg` ou `webp`, ou null si le fichier n'est aucun des trois (il sera alors
 *   traité comme un audio).
 */
export function detectImageFormat(header: Buffer): ImageFormat | null {
  if (header.subarray(0, 8).equals(pngSignature)) {
    return 'png'
  }
  if (header[0] === 255 && header[1] === 216) {
    return 'jpeg'
  }
  const isWebp =
    header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP'
  return isWebp ? 'webp' : null
}
