/**
 * @file assets.repository.ts
 * @brief Lectures qui disent si un fichier de media-service est utilisé par le catalogue.
 *
 * @details Contexte : un morceau a un fichier audio, un album a une pochette, un artiste a une
 *   image. Ces fichiers sont stockés par media-service ; le catalogue n'en garde que l'identifiant.
 *   Media a besoin de savoir, avant d'agir sur un fichier, ce que le catalogue en fait. Ce
 *   repository répond à ses deux questions en cherchant l'identifiant du fichier dans les tables du
 *   catalogue.
 */

import type { Database } from './prisma.js'

/** @brief Liste des questions que l'on peut poser sur un fichier. */
export type AssetsRepository = {
  /** @brief Ce fichier est-il l'audio d'un morceau publié ? */
  isPublished: (assetId: string) => Promise<boolean>
  /** @brief Ce fichier est-il utilisé quelque part dans le catalogue, même par un brouillon ? */
  isReferenced: (assetId: string) => Promise<boolean>
}

/**
 * @brief Partie de la connexion à la base dont ce repository a besoin : l'accès aux tables des
 *   morceaux, des sorties et des artistes.
 * @details Demander seulement ces trois tables, et non toute la connexion, permet à un test de
 *   fournir un faux objet très simple.
 */
type ReferenceReader = Pick<Database, 'track' | 'release' | 'artist'>

/**
 * @brief Crée le repository des références de fichiers.
 * @param prisma Connexion à la base, ou dans un test un faux objet limité aux trois tables lues.
 * @returns Un objet offrant les deux questions de `AssetsRepository`.
 */
export function createAssetsRepository(prisma: ReferenceReader): AssetsRepository {
  const select = { id: true }

  return {
    /**
     * @brief Dit si un morceau publié utilise ce fichier comme audio.
     * @details Media s'en sert pour décider s'il a le droit de diffuser l'audio publiquement :
     *   l'audio d'un brouillon ne doit pas être écoutable.
     * @param assetId Identifiant du fichier dans Media.
     * @returns Vrai si au moins un morceau à l'état `published` l'utilise.
     */
    async isPublished(assetId) {
      const where = { audioAssetId: assetId, status: 'published' }
      return (await prisma.track.findFirst({ where, select })) !== null
    },

    // Aucun filtre de statut : un brouillon protège aussi son fichier contre la suppression.
    /**
     * @brief Dit si le catalogue utilise encore ce fichier, de quelque façon que ce soit.
     * @details Trois usages sont vérifiés : audio d'un morceau, pochette d'une sortie, image d'un
     *   artiste. Les brouillons comptent aussi : supprimer le fichier d'un morceau en préparation
     *   le casserait. Media s'en sert pour refuser la suppression d'un fichier encore utilisé.
     * @param assetId Identifiant du fichier dans Media.
     * @returns Vrai si la suppression doit être refusée.
     */
    async isReferenced(assetId) {
      const references = await Promise.all([
        prisma.track.findFirst({ where: { audioAssetId: assetId }, select }),
        prisma.release.findFirst({ where: { coverAssetId: assetId }, select }),
        prisma.artist.findFirst({ where: { imageAssetId: assetId }, select }),
      ])
      return references.some(Boolean)
    },
  }
}
