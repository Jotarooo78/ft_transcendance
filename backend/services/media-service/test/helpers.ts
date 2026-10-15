/**
 * @file helpers.ts
 * @brief Outils partagés par les tests de media-service.
 *
 * @details Les tests construisent le serveur avec `buildApp` en lui donnant de faux repositories.
 *   Certains utilisent un vrai dossier temporaire sur le disque et le vrai décodeur.
 */

import { buildApp, type Dependencies } from '../src/app.js'
import type { StoredFile, ValidatedFile } from '../src/domain/file.js'
import type { AssetsRepository } from '../src/repositories/assets.repository.js'

/** @brief Identifiant du compte propriétaire des fichiers d'exemple. */
export const owner = '11111111-1111-4111-8111-111111111111'
/**
 * @brief Identifiant d'un autre compte, utilisé pour vérifier qu'il n'accède pas aux fichiers du
 *   premier.
 */
export const other = '22222222-2222-4222-8222-222222222222'
/** @brief Identifiant du fichier d'exemple. */
export const fileId = '33333333-3333-4333-8333-333333333333'
/** @brief Secret utilisé pour signer les jetons de connexion dans les tests. */
export const jwtSecret = 'media-test-secret'

/**
 * @brief Fausse opération qui fait échouer le test si elle est appelée : elle sert à prouver qu'une
 *   route n'utilise pas une dépendance.
 */
const unused = async (): Promise<never> => {
  throw new Error('Unexpected storage call')
}

/**
 * @brief Crée un faux repository dont toutes les opérations échouent, sauf celles que le test
 *   fournit.
 * @param overrides Opérations que le test veut contrôler.
 * @returns Le faux repository.
 */
export function fakeAssets(overrides: Partial<AssetsRepository> = {}): AssetsRepository {
  return {
    find: unused,
    findOwned: unused,
    findOwnedWithAllVariants: unused,
    list: unused,
    hasStorageKey: unused,
    create: unused,
    markDeleting: unused,
    markDeleted: unused,
    pendingDeletions: unused,
    ...overrides,
  }
}

/**
 * @brief Crée un faux repository gardé en mémoire, pour les tests d'envoi.
 * @returns Le faux repository, les fichiers enregistrés et leurs aperçus.
 */
export function memoryStore() {
  const records = new Map<string, StoredFile>()
  const previews = new Map<string, string>()
  const assets = fakeAssets({
    hasStorageKey: async (key) => [...records.values()].some((file) => file.storageKey === key),
    create: async (id, uploaderUserId, file: ValidatedFile, storageKey, previewKey) => {
      const asset: StoredFile = {
        id,
        uploaderUserId,
        purpose: file.purpose === 'audio' ? 'audio' : 'cover',
        state: 'ready',
        storageKey,
        mimeType: file.mimeType,
        byteSize: BigInt(file.byteSize),
        durationMs: file.durationMs === null ? null : BigInt(file.durationMs),
        checksumSha256: file.checksumSha256,
      }
      records.set(id, asset)
      if (previewKey) {
        previews.set(id, previewKey)
      }
      return asset
    },
  })
  return { assets, records, previews }
}

/** @brief Ce qu'un test peut remplacer : dépendances, dossier de stockage et secret. */
type Overrides = Partial<Dependencies> & { storageDir?: string; secret?: string }

/**
 * @brief Construit un serveur de test.
 * @param overrides Fausses dépendances, dossier de stockage et secret que le test veut contrôler.
 * @returns Le serveur, et la fonction `bearer` qui fabrique l'en-tête de connexion d'un compte
 *   donné.
 */
export async function buildTestApp(overrides: Overrides = {}) {
  const { storageDir = '/unused', secret = jwtSecret, ...dependencies } = overrides
  const app = await buildApp(
    { jwtSecret: secret, storageDir, internalServiceToken: 'internal-test-token' },
    {
      covers: {
        replace: unused,
        remove: unused,
        hasStorageKey: unused,
        retired: async () => [],
        forgetRetired: unused,
      },
      publications: { release: unused, reserve: unused, expired: async () => [] },
      assets: fakeAssets(),
      catalog: { isAssetPublished: unused, isAssetReferenced: unused },
      validate: unused,
      ready: async () => undefined,
      logger: false,
      ...dependencies,
    }
  )
  await app.ready()
  const bearer = (subject: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub: subject }, { expiresIn: '1h' })}`,
  })
  return { app, bearer }
}
