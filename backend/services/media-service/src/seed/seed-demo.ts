/**
 * @file seed-demo.ts
 * @brief Commande qui installe les trois fichiers audio de démonstration : `npm run seed:demo`.
 *
 * @details Elle écrit les trois fichiers dans le dossier de stockage et crée leurs lignes en base.
 *   Elle peut être relancée sans risque : ce qui existe déjà et est identique est laissé tel quel.
 *   Si un fichier ou une ligne existe avec un contenu différent, la commande s'arrête sans rien
 *   écraser.
 *
 * Le catalogue possède sa propre commande `seed:demo`, qui crée les morceaux de démonstration
 * utilisant ces fichiers.
 */

import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, mkdir, open, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { Prisma } from '../generated/prisma/client.js'
import { createPrisma } from '../repositories/prisma.js'
import { demoAudio, sha256 } from './audio-fixture.js'

// Commande explicite : jamais importée par le serveur ni par une migration.

/** @brief Connexion à la base à l'intérieur d'une transaction. */
type Tx = Prisma.TransactionClient

/** @brief Dossier où ranger les fichiers audio. */
const storageDir = process.env.MEDIA_STORAGE_DIR ?? '/data/audio'

/**
 * @brief Vérifie qu'un fichier déjà présent contient exactement le contenu attendu.
 * @param path Chemin du fichier.
 * @param expected Contenu attendu.
 * @throws {Error} Si le contenu est différent.
 */
async function assertSameFile(path: string, expected: Buffer): Promise<void> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    const isSame =
      stat.isFile() && stat.size === expected.length && (await file.readFile()).equals(expected)
    if (!isSame) {
      throw new Error('Demo file collision: refusing replacement')
    }
  } finally {
    await file.close()
  }
}

/**
 * @brief Écrit un fichier sous un nom provisoire, puis lui donne son nom définitif sans écraser un
 *   fichier existant.
 * @param path Chemin définitif.
 * @param bytes Contenu.
 */
async function publishFile(path: string, bytes: Buffer): Promise<void> {
  const temporary = join(storageDir, `.demo-${randomUUID()}.tmp`)
  const file = await open(temporary, 'wx', 0o600)
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally {
    await file.close()
  }
  try {
    await link(temporary, path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') {
        throw error
      }
    })
    await assertSameFile(path, bytes)
  } finally {
    await unlink(temporary)
  }
}

/**
 * @brief Crée le fichier s'il n'existe pas ; sinon vérifie qu'il est identique.
 * @param path Chemin du fichier.
 * @param bytes Contenu attendu.
 */
async function ensureFile(path: string, bytes: Buffer): Promise<void> {
  try {
    await assertSameFile(path, bytes)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    await publishFile(path, bytes)
  }
}

/**
 * @brief Installe un fichier de démonstration et sa ligne en base.
 * @param tx Transaction en cours.
 * @param index Numéro du fichier : 1, 2 ou 3.
 */
async function seedAudio(tx: Tx, index: number): Promise<void> {
  const bytes = demoAudio(index)
  const data = {
    id: `30000000-0000-4000-8000-00000000000${index}`,
    purpose: 'audio',
    state: 'ready',
    storageKey: `demo-${index}.wav`,
    mimeType: 'audio/wav',
    byteSize: BigInt(bytes.length),
    durationMs: 6000n,
    checksumSha256: sha256(bytes),
  }
  const existing = await tx.asset.findUnique({ where: { id: data.id } })
  const differs =
    existing &&
    Object.entries(data).some(([key, value]) => existing[key as keyof typeof existing] !== value)
  if (differs) {
    throw new Error('Demo metadata collision: refusing replacement')
  }
  await ensureFile(join(storageDir, data.storageKey), bytes)
  if (!existing) {
    await tx.asset.create({ data })
  }
  console.log(`Demo audio ${index}: ${bytes.length} bytes, SHA-256 ${data.checksumSha256}`)
}

/** @brief Adresse de la base, lue dans la variable d'environnement du service. */
const url = process.env.MEDIA_DATABASE_URL
if (!url) {
  throw new Error('MEDIA_DATABASE_URL is required')
}

/** @brief Connexion ouverte pour la commande, fermée à la fin. */
const prisma = createPrisma(url)
try {
  await mkdir(storageDir, { recursive: true })
  await prisma.$transaction(
    async (tx) => {
      // Sérialise deux seeds concurrents.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261007, 3)::text`
      for (const index of [1, 2, 3]) {
        await seedAudio(tx, index)
      }
    },
    { timeout: 30000 }
  )
} finally {
  await prisma.$disconnect()
}
