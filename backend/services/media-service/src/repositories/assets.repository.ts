/**
 * @file assets.repository.ts
 * @brief Lecture et écriture, en base de données, des informations sur les fichiers.
 *
 * @details Un repository est la couche qui parle à la base. Celui-ci ne touche jamais au contenu
 *   des fichiers (qui est sur le disque) : il gère uniquement les lignes qui les décrivent, dans
 *   les tables `assets` (un fichier) et `variants` (ses copies dérivées) du schéma `media`.
 *
 * Un fichier a un état : `ready` (utilisable), `deleting` (suppression en cours) ou `deleted`
 * (supprimé).
 */

import type { Pagination } from '@ft/service-kit'
import type { StoredFile, StoredFileWithVariants, ValidatedFile } from '../domain/file.js'
import type { Database } from './prisma.js'

/**
 * @brief Type de l'objet renvoyé par `createAssetsRepository` : toutes les opérations disponibles
 *   sur les fichiers.
 * @details Les services ne dépendent que de ce type. Un test peut fournir à la place un objet en
 *   mémoire.
 */
export type AssetsRepository = ReturnType<typeof createAssetsRepository>

/**
 * @brief Partie de la connexion à la base dont ce repository a besoin : les deux tables de
 *   fichiers.
 */
type AssetStore = Pick<Database, 'asset' | 'variant'>

/** @brief Expression régulière décrivant la forme d'un identifiant (UUID). */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** @brief Nom donné en base à la copie « aperçu » d'un fichier audio. */
const previewRendition = 'private-preview'

/** @brief Convertit un nombre facultatif dans le type d'entier attendu par la base. */
const toBigInt = (value: number | null | undefined) =>
  value === null || value === undefined ? null : BigInt(value)

/**
 * @brief Crée le repository des fichiers branché sur PostgreSQL.
 * @param prisma Connexion à la base ; les tests passent un faux objet limité aux deux tables
 *   utilisées.
 * @returns Un objet offrant les lectures et écritures de fichiers.
 */
export function createAssetsRepository(prisma: AssetStore) {
  /**
   * @brief Lit un fichier appartenant à un compte, avec son aperçu.
   * @param owner Identifiant du compte, lu dans son jeton de connexion.
   * @param id Identifiant du fichier.
   * @returns Le fichier, ou null s'il n'existe pas, appartient à un autre compte, ou si l'un des
   *   identifiants est mal formé.
   */
  async function findOwned(owner: string, id: string): Promise<StoredFileWithVariants | null> {
    if (!uuidPattern.test(owner) || !uuidPattern.test(id)) {
      return null
    }
    return prisma.asset.findFirst({
      where: { id: id.toLowerCase(), uploaderUserId: owner.toLowerCase() },
      include: { variants: { where: { renditionKey: { in: [previewRendition, 'cover'] } } } },
    })
  }

  return {
    findOwned,

    /**
     * @brief Lit un fichier à partir de son identifiant, quel que soit son propriétaire.
     * @details Utilisée pour la lecture publique d'un morceau, où il n'y a pas d'utilisateur
     *   connecté.
     * @param id Identifiant du fichier.
     * @returns Le fichier, ou null.
     */
    find(id: string): Promise<StoredFile | null> {
      return prisma.asset.findUnique({
        where: { id },
        include: { variants: { where: { renditionKey: { in: [previewRendition, 'cover'] } } } },
      })
    },

    /**
     * @brief Lit un fichier d'un compte avec toutes ses copies dérivées.
     * @details Utilisée avant une suppression, pour connaître tous les fichiers à retirer du
     *   disque.
     * @param owner Identifiant du compte.
     * @param id Identifiant du fichier.
     * @returns Le fichier et ses copies, ou null.
     */
    async findOwnedWithAllVariants(
      owner: string,
      id: string
    ): Promise<StoredFileWithVariants | null> {
      const asset = await findOwned(owner, id)
      if (!asset) {
        return null
      }
      const variants = await prisma.variant.findMany({ where: { assetId: asset.id } })
      return { ...asset, variants }
    },

    /**
     * @brief Lit une page des fichiers utilisables d'un compte.
     * @param owner Identifiant du compte.
     * @param pagination Numéro de page et nombre de fichiers par page.
     * @returns Les fichiers de la page et leur nombre total.
     */
    async list(owner: string, { page, pageSize }: Pagination) {
      const where = { uploaderUserId: owner, state: 'ready', purpose: 'audio' }
      const [items, total] = await Promise.all([
        prisma.asset.findMany({
          where,
          include: { variants: { where: { renditionKey: 'cover' } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: pageSize,
          skip: (page - 1) * pageSize,
        }),
        prisma.asset.count({ where }),
      ])
      return { items: items as StoredFile[], total }
    },

    /**
     * @brief Dit si un nom de fichier sur le disque est connu de la base.
     * @details Utilisée au démarrage pour décider si un envoi interrompu avait finalement été
     *   enregistré.
     * @param storageKey Nom de fichier à chercher.
     * @returns Vrai si une ligne porte ce nom.
     */
    async hasStorageKey(storageKey: string): Promise<boolean> {
      const asset = await prisma.asset.findUnique({ where: { storageKey }, select: { id: true } })
      return asset !== null
    },

    /**
     * @brief Enregistre en base un fichier qui vient d'être vérifié et rangé sur le disque.
     * @param id Identifiant attribué à l'envoi.
     * @param owner Identifiant du compte propriétaire.
     * @param file Informations établies par la vérification.
     * @param storageKey Nom de l'original sur le disque.
     * @param previewKey Nom de l'aperçu MP3, pour un audio.
     * @returns Le fichier enregistré, dans l'état `ready`.
     */
    create(
      id: string,
      owner: string,
      file: ValidatedFile,
      storageKey: string,
      previewKey?: string,
      expiresAt?: Date
    ) {
      const preview = {
        renditionKey: previewRendition,
        storageKey: previewKey ?? '',
        mimeType: 'audio/mpeg',
        byteSize: BigInt(file.previewByteSize ?? 0),
        bitrateKbps: 128,
      }
      return prisma.asset.create({
        data: {
          id,
          expiresAt: expiresAt ?? null,
          uploaderUserId: owner,
          purpose: file.purpose === 'audio' ? 'audio' : 'cover',
          state: 'ready',
          storageKey,
          mimeType: file.mimeType,
          byteSize: BigInt(file.byteSize),
          durationMs: toBigInt(file.durationMs),
          checksumSha256: file.checksumSha256,
          ...(previewKey ? { variants: { create: preview } } : {}),
        },
      }) as Promise<StoredFile>
    },

    /**
     * @brief Fait passer un fichier de l'état `ready` à l'état `deleting`.
     * @param id Identifiant du fichier.
     * @param owner Identifiant du compte.
     * @returns Vrai si c'est cet appel qui a fait le changement ; faux si une autre requête l'avait
     *   déjà fait. Cela évite que deux suppressions simultanées travaillent sur le même fichier.
     */
    async markDeleting(id: string, owner: string): Promise<boolean> {
      const where = { id, uploaderUserId: owner, state: 'ready', publicationTrackId: null }
      const updated = await prisma.asset.updateMany({ where, data: { state: 'deleting' } })
      return updated.count === 1
    },

    /**
     * @brief Fait passer un fichier à l'état `deleted`, une fois son contenu retiré du disque.
     * @param id Identifiant du fichier.
     * @param owner Identifiant du compte.
     */
    async markDeleted(id: string, owner: string): Promise<void> {
      const where = { id, uploaderUserId: owner, state: 'deleting' }
      await prisma.asset.updateMany({ where, data: { state: 'deleted' } })
    },

    /**
     * @brief Lit les fichiers restés dans l'état `deleting`, c'est-à-dire les suppressions qu'un
     *   arrêt a interrompues.
     * @param maximum Nombre maximal de fichiers à renvoyer.
     * @returns Les fichiers dont la suppression reste à terminer.
     */
    pendingDeletions(maximum: number): Promise<StoredFile[]> {
      return prisma.asset.findMany({
        where: { state: 'deleting', uploaderUserId: { not: null } },
        orderBy: { id: 'asc' },
        take: maximum,
      })
    },
  }
}
