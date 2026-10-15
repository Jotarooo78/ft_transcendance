/**
 * @file track-list.sql.ts
 * @brief Morceaux de requêtes SQL utilisés pour lire les morceaux publiés.
 *
 * @details La plupart des lectures du projet passent par les fonctions de Prisma (`findFirst`,
 *   `findMany`…). La liste des morceaux est une exception : elle doit rassembler plusieurs artistes
 *   en un seul texte, choisir un album et un genre parmi plusieurs, chercher dans quatre tables à
 *   la fois et trier le tout. C'est beaucoup plus lisible et plus efficace en SQL écrit à la main.
 *
 * Sécurité : les textes SQL de ce fichier sont fixes. Tout ce qui vient de l'utilisateur (texte
 * recherché, genre) est inséré par `Prisma.sql` sous forme de paramètre lié, jamais collé dans le
 * texte de la requête. C'est ce qui empêche l'injection SQL, une attaque où un texte malveillant
 * modifie la requête.
 */

import type { ArtistProfile } from '../domain/artist.js'
import { Prisma } from '../generated/prisma/client.js'
import type { TrackListQuery, TrackSort } from '../domain/track-list.js'

// Les fragments de ce fichier sont fixes : toute valeur reçue du client est liée par Prisma.sql.

/**
 * @brief Requête de base : tous les morceaux publiés, avec leurs informations d'affichage.
 * @details Pour chaque morceau à l'état `published`, elle calcule : `artistName`, les noms de ses
 *   artistes séparés par des virgules, les artistes principaux avant les invités ; `albumTitle`, le
 *   titre de sa plus ancienne sortie publiée ; `genre`, son premier genre par ordre alphabétique.
 *   Un morceau sans artiste, sans album ou sans genre reçoit une chaîne vide. Cette requête sert de
 *   point de départ à la lecture d'un morceau comme à la liste.
 */
export const publishedTracks = (profiles: ArtistProfile[] = []) => Prisma.sql`
  SELECT t.id, t.title, t.description, t.created_by_user_id AS "artistUserId", t.audio_asset_id AS "audioAssetId", t.duration_ms AS "durationMs",
    COALESCE((SELECT p."displayName" FROM jsonb_to_recordset(${JSON.stringify(profiles)}::jsonb) AS p("userId" text, "displayName" text) WHERE p."userId"=t.created_by_user_id::text), (
      SELECT string_agg(a.name, ', ' ORDER BY CASE c.role WHEN 'primary' THEN 0 ELSE 1 END, c.credit_order, a.id)
      FROM catalog.track_artists c JOIN catalog.artists a ON a.id = c.artist_id
      WHERE c.track_id = t.id AND c.role IN ('primary', 'featured')
    ), '') AS "artistName",
    COALESCE((
      SELECT r.title
      FROM catalog.release_tracks rt JOIN catalog.releases r ON r.id = rt.release_id
      WHERE rt.track_id = t.id AND r.status = 'published'
      ORDER BY r.release_date NULLS LAST, r.id LIMIT 1
    ), '') AS "albumTitle",
    COALESCE((
      SELECT g.name
      FROM catalog.track_genres tg JOIN catalog.genres g ON g.id = tg.genre_id
      WHERE tg.track_id = t.id
      ORDER BY g.name COLLATE "C", g.id LIMIT 1
    ), '') AS genre
  FROM catalog.tracks t
  WHERE t.status = 'published'`

/**
 * @brief Prépare le texte recherché pour une recherche « contient ».
 * @details En SQL, `ILIKE '%mot%'` trouve les lignes qui contiennent « mot ». Mais dans un tel
 *   motif, `%` et `_` ont un sens spécial (« n'importe quels caractères »). Si l'utilisateur
 *   cherche littéralement « 100% », il faut neutraliser ces caractères, sinon sa recherche ne
 *   voudrait plus dire la même chose.
 * @param text Texte saisi par l'utilisateur.
 * @returns Le motif à donner à `ILIKE`, entouré de `%`.
 */
function toLikePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`
}

/**
 * @brief Construit la requête des morceaux publiés qui correspondent à la recherche.
 * @details Elle part de `publishedTracks` et ne garde que les morceaux qui passent deux filtres. Le
 *   genre : s'il est demandé, le morceau doit porter exactement ce genre. Le texte : s'il est
 *   donné, il doit apparaître dans le titre, dans le nom d'un artiste, dans le titre d'une sortie
 *   publiée ou dans un genre. Le résultat est une table temporaire nommée `filtered`, que le
 *   repository interroge ensuite pour obtenir la page et le total.
 * @param query Critères de recherche validés.
 * @returns Le début de requête SQL définissant `filtered`.
 */
export function filteredTracks(query: TrackListQuery, profiles: ArtistProfile[] = []) {
  const pattern = toLikePattern(query.q)
  return Prisma.sql`
    WITH visible AS (${publishedTracks(profiles)}), filtered AS (
      SELECT v.* FROM visible v
      WHERE (${query.genre} = '' OR EXISTS (
          SELECT 1 FROM catalog.track_genres tg JOIN catalog.genres g ON g.id = tg.genre_id
          WHERE tg.track_id = v.id AND g.name = ${query.genre}))
        AND (${query.q} = '' OR v.title ILIKE ${pattern} OR v."artistName" ILIKE ${pattern}
          OR EXISTS (
            SELECT 1 FROM catalog.release_tracks rt JOIN catalog.releases r ON r.id = rt.release_id
            WHERE rt.track_id = v.id AND r.status = 'published' AND r.title ILIKE ${pattern})
          OR EXISTS (
            SELECT 1 FROM catalog.track_genres tg JOIN catalog.genres g ON g.id = tg.genre_id
            WHERE tg.track_id = v.id AND g.name ILIKE ${pattern})))`
}

/**
 * @brief Colonne utilisée pour chaque ordre de tri.
 * @details `COLLATE "C"` impose un ordre alphabétique simple, identique quelle que soit la langue
 *   configurée sur le serveur de base de données : le tri donne ainsi le même résultat partout.
 */
const sortColumns: Record<TrackSort, Prisma.Sql> = {
  title: Prisma.sql`title COLLATE "C"`,
  artist: Prisma.sql`"artistName" COLLATE "C"`,
  duration: Prisma.sql`"durationMs"`,
}

/**
 * @brief Renvoie la colonne SQL correspondant à l'ordre de tri demandé.
 * @param sort Ordre de tri, déjà validé.
 * @returns Le fragment SQL à placer après `ORDER BY`.
 */
export const sortColumn = (sort: TrackSort) => sortColumns[sort]

/**
 * @brief Requête qui liste, sans doublon et par ordre alphabétique, les genres portés par au moins
 *   un morceau publié.
 * @details Le client s'en sert pour proposer un filtre par genre qui ne contient que des genres
 *   réellement utilisables.
 */
export const publishedGenres = Prisma.sql`
  SELECT DISTINCT g.name COLLATE "C" AS name
  FROM catalog.genres g
  JOIN catalog.track_genres tg ON tg.genre_id = g.id
  JOIN catalog.tracks t ON t.id = tg.track_id
  WHERE t.status = 'published'
  ORDER BY name`
