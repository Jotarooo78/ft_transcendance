import { Prisma } from "../generated/prisma/client.js";
import { toTrackDto, type TrackList, type TrackQuery, type TrackRow } from "../catalog.js";
import { prisma } from "./prisma.js";

// Fixed SQL fragments only; all request values are bound through Prisma.sql.
const projection = Prisma.sql`
  SELECT t.id, t.title, t.audio_asset_id AS "audioAssetId", t.duration_ms AS "durationMs",
    COALESCE((SELECT string_agg(a.name, ', ' ORDER BY CASE c.role WHEN 'primary' THEN 0 ELSE 1 END, c.credit_order, a.id)
      FROM catalog.track_artists c JOIN catalog.artists a ON a.id=c.artist_id
      WHERE c.track_id=t.id AND c.role IN ('primary','featured')), '') AS "artistName",
    COALESCE((SELECT r.title FROM catalog.release_tracks rt JOIN catalog.releases r ON r.id=rt.release_id
      WHERE rt.track_id=t.id AND r.status='published' ORDER BY r.release_date NULLS LAST, r.id LIMIT 1), '') AS "albumTitle",
    COALESCE((SELECT g.name FROM catalog.track_genres tg JOIN catalog.genres g ON g.id=tg.genre_id
      WHERE tg.track_id=t.id ORDER BY g.name COLLATE "C", g.id LIMIT 1), '') AS genre
  FROM catalog.tracks t WHERE t.status='published'`;

export async function listTracks(query: TrackQuery): Promise<TrackList> {
  // Escape LIKE metacharacters so q remains a literal substring.
  const pattern = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
  const filtered = Prisma.sql`WITH visible AS (${projection}), filtered AS (
    SELECT v.* FROM visible v WHERE
      (${query.genre} = '' OR EXISTS (SELECT 1 FROM catalog.track_genres tg JOIN catalog.genres g ON g.id=tg.genre_id
        WHERE tg.track_id=v.id AND g.name=${query.genre}))
      AND (${query.q} = '' OR v.title ILIKE ${pattern} OR v."artistName" ILIKE ${pattern}
        OR EXISTS (SELECT 1 FROM catalog.release_tracks rt JOIN catalog.releases r ON r.id=rt.release_id
          WHERE rt.track_id=v.id AND r.status='published' AND r.title ILIKE ${pattern})
        OR EXISTS (SELECT 1 FROM catalog.track_genres tg JOIN catalog.genres g ON g.id=tg.genre_id
          WHERE tg.track_id=v.id AND g.name ILIKE ${pattern})))`;
  const order = query.sort === "artist" ? Prisma.sql`"artistName" COLLATE "C"` :
    query.sort === "duration" ? Prisma.sql`"durationMs"` : Prisma.sql`title COLLATE "C"`;
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<TrackRow[]>(Prisma.sql`${filtered}
      SELECT * FROM filtered ORDER BY ${order} ASC NULLS LAST, id ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
    const counts = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`${filtered} SELECT count(*) AS total FROM filtered`);
    const genres = await tx.$queryRaw<{ name: string }[]>`
      SELECT DISTINCT g.name COLLATE "C" AS name FROM catalog.genres g
      JOIN catalog.track_genres tg ON tg.genre_id=g.id JOIN catalog.tracks t ON t.id=tg.track_id
      WHERE t.status='published' ORDER BY name`;
    const total = Number(counts[0]?.total ?? 0n);
    if (!Number.isSafeInteger(total)) throw new Error("Unrepresentable total");
    return { items: rows.map(toTrackDto), total, page: query.page, pageSize: query.pageSize,
      genres: genres.map(g => g.name) };
  }, { isolationLevel: "RepeatableRead" });
}
