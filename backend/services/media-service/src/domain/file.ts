/**
 * @file file.ts
 * @brief Définition d'un fichier stocké, sous ses différentes formes, et choix de ce qui peut en
 *   être montré au client.
 *
 * @details Un fichier envoyé par un utilisateur donne lieu à trois choses. L'original : le fichier
 *   tel qu'il a été reçu, rangé sur le disque. Une ligne en base, qui décrit ce fichier. Et, pour
 *   un fichier audio, un « aperçu » : une copie convertie en MP3, plus légère, qui sert à réécouter
 *   le fichier dans la page de gestion. Dans le code, cette copie dérivée s'appelle une « variante
 *   ».
 *
 * Deux informations ne sortent jamais du service : le nom du fichier sur le disque (`storageKey`)
 * et l'identité de son propriétaire.
 */

/**
 * @brief Ce que la vérification d'un fichier envoyé a permis d'établir : sa nature réelle, son
 *   type, sa taille, et sa durée ou ses dimensions.
 */
export type ValidatedFile = {
  /** @brief Nature du fichier, déduite de son contenu réel. */
  purpose: 'audio' | 'image'
  /** @brief Type MIME retenu après décodage. */
  mimeType: string
  /** @brief Taille de l'original, en octets. */
  byteSize: number
  /** @brief Empreinte SHA-256 de l'original. */
  checksumSha256: string
  /** @brief Durée d'un audio en millisecondes ; null pour une image. */
  durationMs: number | null
  /** @brief Largeur d'une image, en pixels. */
  width?: number
  /** @brief Hauteur d'une image, en pixels. */
  height?: number
  /** @brief Taille de l'aperçu MP3 généré pour un audio. */
  previewByteSize?: number
}

/** @brief Un fichier tel qu'il est décrit en base de données. */
export type StoredFile = {
  /** Représentations chargées par les lectures de fichiers ; absentes des anciennes fixtures. */
  variants?: FileVariant[]
  /** @brief UUID du fichier. */
  id: string
  /** @brief null pour un fichier de démonstration, sans propriétaire. */
  uploaderUserId: string | null
  /** @brief `audio` ou `cover` pour les fichiers gérés ici. */
  purpose: string
  /** @brief `ready`, puis `deleting` pendant une suppression et `deleted` après. */
  state: string
  /** @brief Nom du fichier sur le volume ; ne doit jamais atteindre le client. */
  storageKey: string
  /** @brief Type MIME vérifié à l'envoi. */
  mimeType: string
  /** @brief Taille de l'original, en octets. */
  byteSize: bigint | null
  /** @brief Durée d'un audio, en millisecondes. */
  durationMs: bigint | null
  /** @brief Empreinte SHA-256 de l'original, calculée à l'envoi. */
  checksumSha256: string | null
}

/** @brief Une copie dérivée d'un original, par exemple l'aperçu MP3 d'un fichier audio. */
export type FileVariant = {
  /** Identifiant et rôle de la représentation ; les anciennes doublures peuvent les omettre. */
  id?: string
  renditionKey?: string
  storageKey: string
  mimeType: string
  byteSize: bigint
}
/** Pochette réellement persistée, dont l’identifiant accompagne toujours la réponse publique. */
export type CoverVariant = FileVariant & { id: string; renditionKey: string }
/** Métadonnées publiques d’une pochette, sans chemin disque. */
export function toPublicCover(cover: FileVariant) {
  return { id: cover.id, mimeType: cover.mimeType, byteSize: Number(cover.byteSize) }
}

/** @brief Un fichier accompagné de la liste de ses copies dérivées. */
export type StoredFileWithVariants = StoredFile & { variants: FileVariant[] }

/**
 * @brief Les deux usages des fichiers envoyés par les utilisateurs : `audio` (un morceau) et
 *   `cover` (une image de pochette).
 */
const managedPurposes = ['audio', 'cover']
/**
 * @brief Expression régulière d'un nom de fichier sûr : il commence par une lettre ou un chiffre et
 *   ne contient ensuite que des lettres, des chiffres, `.`, `_` et `-`.
 */
const storageKeyPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

/**
 * @brief Dit si un fichier est un fichier personnel géré par ce service.
 * @param purpose Usage lu en base.
 * @returns Vrai pour `audio` ou `cover`.
 */
export const isManagedPurpose = (purpose: string) => managedPurposes.includes(purpose)

/**
 * @brief Dit si un nom de fichier lu en base peut être ouvert sans risque.
 * @details Un nom contenant un séparateur de dossier (`/`) ou commençant par un point pourrait
 *   désigner un fichier situé hors du dossier de stockage ; le format accepté rend cela impossible.
 *   Même si la base est censée ne contenir que des noms corrects, on revérifie avant chaque
 *   ouverture.
 * @param key Nom lu en base.
 * @returns Vrai si le nom est sûr.
 */
export const isSafeStorageKey = (key: string) => storageKeyPattern.test(key)

/**
 * @brief Réduit un fichier aux seules informations que le client a le droit de voir.
 * @details L'usage `cover` devient `image` pour le client. Le nom sur le disque et le propriétaire
 *   sont retirés.
 * @param file Fichier lu en base.
 * @returns Identifiant, nature (`audio` ou `image`), état, type, taille et durée.
 */
export function toPublicFile(file: StoredFile & { variants?: FileVariant[] }) {
  return {
    cover: file.variants?.find((v) => v.renditionKey === 'cover')
      ? toPublicCover(file.variants.find((v) => v.renditionKey === 'cover')!)
      : null,
    id: file.id,
    usage: file.purpose === 'audio' ? 'audio' : 'image',
    state: file.state,
    mimeType: file.mimeType,
    byteSize: Number(file.byteSize),
    durationMs: file.durationMs === null ? null : Number(file.durationMs),
  }
}
