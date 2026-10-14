/** Vérifie l’extraction avec de vrais MP3 : JPEG/PNG, image facultative invalide, limites et original inchangé. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { demoAudio } from "./database/audio-fixture.js";
import { createFileValidator, FileError } from "./validate-file.js";
import { extractAudioCover } from "./extract-audio-cover.js";

test("attached JPEG/PNG extraction is validated and never changes the MP3", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cover-extract-"));
  try {
    const audio = join(directory, "audio.wav"); await writeFile(audio, demoAudio(1));
    assert.equal(await extractAudioCover(audio, join(directory, "absent")), null);
    for (const format of ["jpeg", "png"] as const) {
      const image = join(directory, `image.${format}`);
      await sharp({ create: { width: 32, height: 16, channels: 3, background: "red" } }).toFormat(format).toFile(image);
      const mp3 = join(directory, `${format}.mp3`);
      execFileSync("ffmpeg", ["-v", "error", "-i", audio, "-i", image, "-map", "0:a", "-map", "1:v", "-c:a", "libmp3lame", "-c:v", "copy", "-disposition:v", "attached_pic", mp3]);
      const original = await readFile(mp3), output = join(directory, `${format}.extracted`);
      const result = await extractAudioCover(mp3, output);
      assert.equal(result?.purpose, "image"); assert.equal(result?.mimeType, `image/${format}`);
      assert.equal(result?.width, 32); assert.equal(result?.height, 16);
      assert.deepEqual(await readFile(output), await readFile(image));
      assert.deepEqual(await readFile(mp3), original);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("unusable cover and bounded extraction do not invalidate the audio", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cover-invalid-"));
  try {
    const audio = join(directory, "audio.wav"), image = join(directory, "wide.png"), mp3 = join(directory, "wide.mp3");
    await writeFile(audio, demoAudio(1));
    await sharp({ create: { width: 8193, height: 1, channels: 3, background: "red" } }).png().toFile(image);
    execFileSync("ffmpeg", ["-v", "error", "-i", audio, "-i", image, "-map", "0:a", "-map", "1:v", "-c:a", "libmp3lame", "-c:v", "copy", "-disposition:v", "attached_pic", mp3]);
    assert.equal((await createFileValidator()(mp3, "audio/mpeg")).purpose, "audio");
    await assert.rejects(extractAudioCover(mp3, join(directory, "cover")), error => error instanceof FileError && error.code === "cover_unavailable");
    await assert.rejects(readFile(join(directory, "cover")));
    await assert.rejects(extractAudioCover(mp3, join(directory, "time"), { timeMs: 1 }), error => error instanceof FileError && error.code === "processing_limit");
    await assert.rejects(extractAudioCover(mp3, join(directory, "memory"), { memoryBytes: 1 }), error => error instanceof FileError && error.code === "processing_limit");
    const controller = new AbortController(); controller.abort();
    await assert.rejects(extractAudioCover(mp3, join(directory, "abort"), { signal: controller.signal }), error => error instanceof FileError && error.code === "upload_aborted");
    const broken = await readFile(mp3); const png = await readFile(image); const offset = broken.indexOf(png);
    assert.ok(offset >= 0); broken.fill(0, offset + 48, offset + 56);
    const corruptCover = join(directory, "corrupt-cover.mp3"); await writeFile(corruptCover, broken);
    assert.equal((await createFileValidator()(corruptCover, "audio/mpeg")).purpose, "audio");
    await assert.rejects(extractAudioCover(corruptCover, join(directory, "broken-image")));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
