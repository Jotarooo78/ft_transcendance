import { strict as assert } from "node:assert";
import { disconnectPrisma, prisma } from "./prisma.js";

// Explicit command only. Never imported by the server or a migration.
const artistId = "10000000-0000-4000-8000-000000000001";
const genreId = "10000000-0000-4000-8000-000000000002";
const titles = ["Aube — demo", "Brise — demo", "Clair — demo"];
const publishedAt = new Date("2026-01-01T00:00:00.000Z");

function matches(actual: object, expected: object, kind: string): void {
  const record = actual as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(record[key], value, `Demo collision: ${kind}.${key}`);
  }
}

try {
  await prisma.$transaction(async (tx) => {
    // Serialize competing seed commands; never silently overwrite collisions.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71420, 1)`;
    const artist = { id: artistId, name: "Atelier Demo", slug: "atelier-demo" };
    const oldArtist = await tx.artist.findUnique({ where: { id: artistId } });
    if (oldArtist) matches(oldArtist, artist, "artist");
    else await tx.artist.create({ data: artist });
    const genre = { id: genreId, name: "Demo" };
    const oldGenre = await tx.genre.findUnique({ where: { id: genreId } });
    if (oldGenre) matches(oldGenre, genre, "genre");
    else await tx.genre.create({ data: genre });

    for (const [i, title] of titles.entries()) {
      const suffix = String(i + 1).padStart(12, "0");
      const track = {
        id: `20000000-0000-4000-8000-${suffix}`,
        title,
        audioAssetId: `30000000-0000-4000-8000-${suffix}`,
        durationMs: 6000n,
        status: "published",
        publishedAt,
      };
      const old = await tx.track.findUnique({ where: { id: track.id } });
      if (old) matches(old, track, "track");
      else await tx.track.create({ data: track });
      const credit = { trackId: track.id, artistId, role: "primary", creditOrder: 1 };
      const oldCredit = await tx.trackArtist.findUnique({
        where: { trackId_artistId_role: { trackId: track.id, artistId, role: "primary" } },
      });
      if (oldCredit) matches(oldCredit, credit, "credit");
      else await tx.trackArtist.create({ data: credit });
      const link = { trackId: track.id, genreId };
      if (!(await tx.trackGenre.findUnique({ where: { trackId_genreId: link } }))) {
        await tx.trackGenre.create({ data: link });
      }
    }
    const draft = {
      id: "20000000-0000-4000-8000-000000000099",
      title: "Brouillon — demo",
      status: "draft",
      audioAssetId: null,
      durationMs: null,
      publishedAt: null,
    };
    const oldDraft = await tx.track.findUnique({ where: { id: draft.id } });
    if (oldDraft) matches(oldDraft, draft, "draft");
    else await tx.track.create({ data: draft });
  });
  console.log("PASS catalog demo: 3 published tracks, 1 draft, stable identities");
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : "Catalogue demo installation failed; no partial transaction committed");
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
