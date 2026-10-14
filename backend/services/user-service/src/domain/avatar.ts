/**
 * @file avatar.ts
 * @brief Règles des avatars : quels types d'image sont acceptés, comment reconnaître une vraie
 *   image, et comment nommer le fichier.
 *
 * @details Un avatar est l'image de profil d'un utilisateur. Deux précautions de sécurité sont
 *   prises ici. D'abord, on ne fait pas confiance au type annoncé par le navigateur : on lit les
 *   premiers octets du fichier, qui sont propres à chaque format d'image, pour vérifier que c'est
 *   bien une image. Ensuite, le nom du fichier sur le disque est fabriqué par le serveur et jamais
 *   repris du client, ce qui empêche d'écrire ou de lire en dehors du dossier des avatars.
 */

/** @brief Taille maximale d'un avatar : 2 Mio. */
export const maxAvatarBytes = 2 * 1024 * 1024

/** @brief Extension de fichier correspondant à chaque type d'image accepté. */
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const
/** @brief Type d'image à annoncer au navigateur pour chaque extension de fichier. */
const contentTypes = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const

/** @brief Les trois types d'image acceptés : `image/png`, `image/jpeg` et `image/webp`. */
export type AvatarMimeType = keyof typeof extensions
/** @brief Les trois extensions de fichier d'avatar possibles. */
type AvatarExtension = keyof typeof contentTypes

/** @brief Les huit premiers octets de tout fichier PNG, qui permettent de le reconnaître. */
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/**
 * @brief Expression régulière du seul format de nom d'avatar accepté : identifiant du compte,
 *   tiret, identifiant du fichier, extension.
 */
const fileNamePattern = /^[0-9a-f-]{36}-[0-9a-f-]{36}\.(png|jpg|webp)$/i

/**
 * @brief Dit si le type d'image annoncé par le client est accepté.
 * @param value Type annoncé.
 * @returns Vrai pour PNG, JPEG ou WebP.
 */
export const isAvatarMimeType = (value: string): value is AvatarMimeType =>
  Object.hasOwn(extensions, value)

/**
 * @brief Dit si un nom de fichier a exactement le format des avatars du service.
 * @details Ce contrôle est fait avant toute lecture sur le disque. Un nom contenant `/` ou `..` ne
 *   correspond pas au format et est refusé : impossible de sortir du dossier des avatars.
 * @param value Nom reçu dans l'URL.
 * @returns Vrai si le nom est sûr.
 */
export const isAvatarFileName = (value: string) => fileNamePattern.test(value)

/**
 * @brief Reconnaît le vrai type d'une image en lisant ses premiers octets.
 * @param bytes Contenu du fichier.
 * @returns Le type d'image reconnu, ou null si le contenu n'est ni un PNG, ni un JPEG, ni un WebP.
 */
export function detectAvatarMimeType(bytes: Buffer): AvatarMimeType | null {
  if (bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  const isWebp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  return isWebp ? 'image/webp' : null
}

/**
 * @brief Fabrique le nom sous lequel un avatar est enregistré sur le disque.
 * @param userId Identifiant du compte.
 * @param fileId Identifiant aléatoire attribué à ce fichier ; un nouvel avatar ne remplace donc pas
 *   le fichier précédent.
 * @param mimeType Type de l'image, qui détermine l'extension.
 * @returns Le nom du fichier.
 */
export const avatarFileName = (userId: string, fileId: string, mimeType: AvatarMimeType) =>
  `${userId}-${fileId}.${extensions[mimeType]}`

/**
 * @brief Fabrique l'adresse à laquelle le navigateur pourra charger un avatar.
 * @param fileName Nom du fichier sur le disque.
 * @returns Le chemin `/api/users/avatars/<nom>`, tel que vu par le navigateur à travers Nginx.
 */
export const avatarUrl = (fileName: string) => `/api/users/avatars/${fileName}`

/**
 * @brief Déduit de l'extension d'un avatar le type d'image à annoncer au navigateur.
 * @param fileName Nom du fichier.
 * @returns Le type d'image.
 */
export function avatarContentType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() as AvatarExtension
  return contentTypes[extension] ?? 'image/webp'
}
