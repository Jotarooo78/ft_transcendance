/** Branche les routes Catalogue sur les lecteurs Prisma du schéma catalog et ouvre le port configuré. */
import { registerTrackPublication } from "./publish-track.js";
import { readArtistProfile } from "./read-artist-profile.js";
import { buildApp } from "./app.js";
import { toTrackDto } from "./catalog.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";
import { listTracks } from "./database/catalog-list.js";
import { isAssetReferenced } from "./database/check-asset-references.js";

/** Lit les métadonnées publiées et l’identité actuelle de leur compte artiste. */
async function readTrack(id: string) {
    const track = await prisma.track.findFirst({
      where: { id, status: "published" },
      include: {
        artists: { where: { role: { in: ["primary", "featured"] } }, include: { artist: true } },
        genres: { include: { genre: true } },
        releaseTracks: { where: { release: { status: "published" } }, include: { release: true } },
      },
    });
    if (!track) return null;
    const credits = track.artists.sort((a, b) =>
      (a.role === b.role ? 0 : a.role === "primary" ? -1 : 1) ||
      a.creditOrder - b.creditOrder || a.artistId.localeCompare(b.artistId));
    const genres = track.genres.sort((a, b) =>
      Buffer.compare(Buffer.from(a.genre.name), Buffer.from(b.genre.name)) ||
      a.genreId.localeCompare(b.genreId));
    const releases = track.releaseTracks.sort((a, b) =>
      (a.release.releaseDate?.getTime() ?? Infinity) - (b.release.releaseDate?.getTime() ?? Infinity) ||
      a.releaseId.localeCompare(b.releaseId));
    const profile = track.createdByUserId ? await readArtistProfile(track.createdByUserId) : null;
    return { ...toTrackDto({
      id: track.id, title: track.title, audioAssetId: track.audioAssetId, durationMs: track.durationMs,
      artistName: profile?.displayName ?? credits.map(c => c.artist.name).join(", "),
      artistUserId: track.createdByUserId, description: track.description,
      albumTitle: releases[0]?.release.title ?? "", genre: genres[0]?.genre.name ?? "",
    }), ...(profile ? { artistAvatarUrl: profile.avatarUrl } : {}) };
}

/**
 * Application HTTP assemblée avec ses lecteurs et écrivains ; l’ouverture du port est effectuée
 * séparément.
 */
const app = buildApp({
  logger: true,
  close: disconnectPrisma,
  listTracks,
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? "",
  /** Interroge les références audio, couverture et artiste, quel que soit l’état de publication. */
  isAssetReferenced: id => isAssetReferenced(prisma, id),
  /** Vérifie qu’au moins un morceau publié utilise cet audio avant sa diffusion publique. */
  isAssetPublished: async audioAssetId => !!await prisma.track.findFirst({
    where: { audioAssetId, status: "published" }, select: { id: true },
  }),
  /** Interroge PostgreSQL pour que /ready atteste la disponibilité de la base. */
  ready: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  readTrack,
});

registerTrackPublication(app, prisma, readTrack);

await app.listen({ port: Number(process.env.PORT ?? 4002), host: "0.0.0.0" });
