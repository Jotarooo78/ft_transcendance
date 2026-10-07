import { constants } from "node:fs";
import { mkdir, open, link, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { demoAudio, sha256 } from "./audio-fixture.js";
import { disconnectPrisma, prisma } from "./prisma.js";

const storage = process.env.MEDIA_STORAGE_DIR ?? "/data/audio";

async function verifyFile(path: string, expected: Buffer): Promise<void> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size !== expected.length || !(await file.readFile()).equals(expected)) {
      throw new Error("Demo file collision: refusing replacement");
    }
  } finally { await file.close(); }
}

try {
  await mkdir(storage, { recursive: true });
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261007, 3)::text`;
    for (const index of [1, 2, 3]) {
      const bytes = demoAudio(index);
      const data = {
        id: `30000000-0000-4000-8000-00000000000${index}`,
        purpose: "audio", state: "ready", storageKey: `demo-${index}.wav`,
        mimeType: "audio/wav", byteSize: BigInt(bytes.length), durationMs: 6000n,
        checksumSha256: sha256(bytes),
      };
      const existing = await tx.asset.findUnique({ where: { id: data.id } });
      if (existing && Object.entries(data).some(([key, value]) => existing[key as keyof typeof existing] !== value)) {
        throw new Error("Demo metadata collision: refusing replacement");
      }
      const path = join(storage, data.storageKey);
      try { await verifyFile(path, bytes); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const temporary = join(storage, `.demo-${randomUUID()}.tmp`);
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.writeFile(bytes); await file.sync();
        } finally { await file.close(); }
        try {
          // Atomic publication without overwriting a concurrent/existing file.
          try { await link(temporary, path); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
          await verifyFile(path, bytes);
        } finally { await unlink(temporary); }
      }
      if (!existing) await tx.asset.create({ data });
      console.log(`Demo audio ${index}: ${bytes.length} bytes, SHA-256 ${data.checksumSha256}`);
    }
  }, { timeout: 30000 });
} finally { await disconnectPrisma(); }
