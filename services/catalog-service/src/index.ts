import { buildApp } from "./app.js";
import { toTrackDto } from "./catalog.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";

const app = buildApp({
  logger: true,
  close: disconnectPrisma,
  ready: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  readTrack: async (id) => {
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
    return toTrackDto({
      id: track.id, title: track.title, audioAssetId: track.audioAssetId, durationMs: track.durationMs,
      artistName: credits.map(c => c.artist.name).join(", "),
      albumTitle: releases[0]?.release.title ?? "", genre: genres[0]?.genre.name ?? "",
    });
  },
});

await app.listen({ port: Number(process.env.PORT ?? 4002), host: "0.0.0.0" });
