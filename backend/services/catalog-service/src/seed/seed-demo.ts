/**
 * @file seed-demo.ts
 * @brief Commande qui installe des données de démonstration dans le catalogue : `npm run
 *   seed:demo`.
 *
 * @details Le catalogue n'a aucune route pour créer des morceaux ; sans cette commande il est vide.
 *   Elle crée un artiste, un genre, trois morceaux publiés et un morceau en brouillon, avec des
 *   identifiants fixes pour que les tests puissent les retrouver. Les trois morceaux publiés
 *   pointent vers les trois fichiers audio de démonstration que la commande équivalente de
 *   media-service installe.
 *
 * Elle n'est jamais lancée automatiquement, ni par le serveur ni par une migration : il faut la
 * demander. Elle peut être relancée sans danger : une ligne déjà présente et identique est laissée
 * telle quelle. Si une ligne existe avec un contenu différent, la commande s'arrête sans rien
 * modifier, pour ne jamais écraser des données.
 */

import { strict as assert } from 'node:assert'
import type { Prisma } from '../generated/prisma/client.js'
import { createPrisma } from '../repositories/prisma.js'

// Commande explicite : jamais importée par le serveur ni par une migration.

/**
 * @brief Connexion à la base à l'intérieur d'une transaction, c'est-à-dire d'un groupe d'écritures
 *   qui réussissent toutes ou échouent toutes.
 */
type Tx = Prisma.TransactionClient

/**
 * @brief L'artiste de démonstration. Son identifiant est fixe pour que la commande retrouve la même
 *   ligne d'une exécution à l'autre.
 */
const artist = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Atelier Demo',
  slug: 'atelier-demo',
}
/** @brief Le genre de démonstration, attribué aux trois morceaux publiés. */
const genre = { id: '10000000-0000-4000-8000-000000000002', name: 'Demo' }
/** @brief Titres des trois morceaux publiés de démonstration. */
const titles = ['Aube — demo', 'Brise — demo', 'Clair — demo']
/**
 * @brief Date de publication des morceaux de démonstration, fixe pour que le résultat soit
 *   identique à chaque exécution.
 */
const publishedAt = new Date('2026-01-01T00:00:00.000Z')
/**
 * @brief Un morceau à l'état brouillon.
 * @details Il sert de témoin : les tests vérifient qu'il n'apparaît dans aucune lecture publique.
 */
const draft = {
  id: '20000000-0000-4000-8000-000000000099',
  title: 'Brouillon — demo',
  status: 'draft',
  audioAssetId: null,
  durationMs: null,
  publishedAt: null,
}

/**
 * @brief Vérifie qu'une ligne déjà présente en base contient bien les valeurs de la démonstration.
 * @param actual Ligne trouvée en base.
 * @param expected Valeurs que la démonstration attend.
 * @param kind Nom de l'objet (artiste, morceau…), repris dans le message d'erreur.
 * @throws {AssertionError} Si un champ est différent : la commande s'arrête alors sans rien écrire.
 */
function assertSame(actual: object, expected: object, kind: string): void {
  const record = actual as Record<string, unknown>
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(record[key], value, `Demo collision: ${kind}.${key}`)
  }
}

/**
 * @brief Garantit qu'une ligne de démonstration existe : la crée si elle manque, la vérifie si elle
 *   existe.
 * @details C'est ce qui rend la commande rejouable sans créer de doublon.
 * @param kind Nom de l'objet, pour le message d'erreur.
 * @param expected Valeurs attendues.
 * @param find Fonction qui cherche la ligne existante.
 * @param create Fonction qui crée la ligne.
 */
async function ensure<T extends object>(
  kind: string,
  expected: T,
  find: () => Promise<object | null>,
  create: () => Promise<unknown>
): Promise<void> {
  const existing = await find()
  if (existing) {
    assertSame(existing, expected, kind)
    return
  }
  await create()
}

/**
 * @brief Fabrique les données d'un morceau publié de démonstration.
 * @param index Rang du morceau : 0, 1 ou 2.
 * @param title Titre du morceau.
 * @returns Les valeurs à écrire en base. L'identifiant du fichier audio correspond au fichier de
 *   démonstration de même rang dans media-service.
 */
function demoTrack(index: number, title: string) {
  const suffix = String(index + 1).padStart(12, '0')
  return {
    id: `20000000-0000-4000-8000-${suffix}`,
    title,
    audioAssetId: `30000000-0000-4000-8000-${suffix}`,
    durationMs: 6000n,
    status: 'published',
    publishedAt,
  }
}

/**
 * @brief Installe un morceau publié et le relie à l'artiste et au genre de démonstration.
 * @param tx Transaction en cours.
 * @param index Rang du morceau.
 * @param title Titre du morceau.
 */
async function seedPublishedTrack(tx: Tx, index: number, title: string): Promise<void> {
  const track = demoTrack(index, title)
  await ensure(
    'track',
    track,
    () => tx.track.findUnique({ where: { id: track.id } }),
    () => tx.track.create({ data: track })
  )

  const credit = { trackId: track.id, artistId: artist.id, role: 'primary', creditOrder: 1 }
  const creditKey = { trackId: track.id, artistId: artist.id, role: 'primary' }
  await ensure(
    'credit',
    credit,
    () => tx.trackArtist.findUnique({ where: { trackId_artistId_role: creditKey } }),
    () => tx.trackArtist.create({ data: credit })
  )

  const link = { trackId: track.id, genreId: genre.id }
  await ensure(
    'genre link',
    link,
    () => tx.trackGenre.findUnique({ where: { trackId_genreId: link } }),
    () => tx.trackGenre.create({ data: link })
  )
}

/**
 * @brief Installe toutes les données de démonstration dans une seule transaction.
 * @details La première instruction prend un verrou dans la base : si deux personnes lancent la
 *   commande en même temps, la seconde attend la fin de la première au lieu de créer les mêmes
 *   lignes en parallèle.
 * @param tx Transaction en cours.
 */
async function seedDemo(tx: Tx): Promise<void> {
  // Sérialise deux seeds concurrents : le second attend puis ne trouve que des lignes identiques.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(71420, 1)`
  await ensure(
    'artist',
    artist,
    () => tx.artist.findUnique({ where: { id: artist.id } }),
    () => tx.artist.create({ data: artist })
  )
  await ensure(
    'genre',
    genre,
    () => tx.genre.findUnique({ where: { id: genre.id } }),
    () => tx.genre.create({ data: genre })
  )
  for (const [index, title] of titles.entries()) {
    await seedPublishedTrack(tx, index, title)
  }
  await ensure(
    'draft',
    draft,
    () => tx.track.findUnique({ where: { id: draft.id } }),
    () => tx.track.create({ data: draft })
  )
}

/**
 * @brief Adresse de la base, lue directement dans l'environnement.
 * @details Cette commande n'utilise pas `loadConfig`, pour ne dépendre que de la variable dont elle
 *   a réellement besoin.
 */
const url = process.env.CATALOG_DATABASE_URL
if (!url) {
  throw new Error('CATALOG_DATABASE_URL is required')
}

/** @brief Connexion à la base utilisée par la commande, fermée à la fin. */
const prisma = createPrisma(url)
try {
  await prisma.$transaction(seedDemo)
  console.log('PASS catalog demo: 3 published tracks, 1 draft, stable identities')
} catch (error) {
  const isCollision = error instanceof assert.AssertionError
  console.error(
    isCollision
      ? error.message
      : 'Catalogue demo installation failed; no partial transaction committed'
  )
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
