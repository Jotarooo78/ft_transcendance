/** Tests sur de vrais fichiers et décodeurs : contenu, MIME, troncature, dimensions, budget, annulation et aperçu. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, open, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { demoAudio } from "./database/audio-fixture.js";
import { createFileValidator, FileError, audioByteLimit, imageByteLimit } from "./validate-file.js";

/** Validateur isolé partagé par les uploads, avec contrôle des octets avant création SQL. */
const validate = createFileValidator();
/**
 * Exige que le validateur refuse la fixture avec le statut prévu ; un succès inattendu fait échouer le
 * test.
 */
const rejects = (promise: Promise<unknown>, status: number, code?: string) => assert.rejects(promise,
  error => error instanceof FileError && error.status === status && (!code || error.code === code));

test("real full audio decoding: WAV, FLAC, MP3, AAC/M4A, Ogg and Opus", async () => {
  const dir = await mkdtemp(join(tmpdir(), "file-audio-"));
  try {
    const source = join(dir, "source.wav"); const bytes = demoAudio(1); await writeFile(source, bytes);
    const wav = await validate(source, "audio/wav");
    assert.equal(wav.durationMs, 6000); assert.equal(wav.byteSize, bytes.length);
    assert.equal(wav.checksumSha256, createHash("sha256").update(bytes).digest("hex"));
    for (const [extension, codec, mime] of [["flac", "flac", "audio/flac"], ["mp3", "libmp3lame", "audio/mpeg"],
      ["aac", "aac", "audio/aac"], ["m4a", "aac", "audio/mp4"], ["ogg", "libvorbis", "audio/ogg"], ["opus", "libopus", "audio/opus"]]) {
      const output = join(dir, `audio.${extension}`);
      execFileSync("ffmpeg", ["-v", "error", "-i", source, "-c:a", codec!, output]);
      const result = await validate(output, mime!);
      assert.equal(result.purpose, "audio"); assert.ok(result.durationMs! >= 5900 && result.durationMs! <= 6800);
      await validate(output, "application/octet-stream");
    }
    await rejects(validate(source, "image/png"), 415);
    await rejects(validate(source, "audio/mpeg"), 415, "mime_mismatch");
    await symlink(source, join(dir, "link")); await rejects(validate(join(dir, "link"), "audio/wav"), 503);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("audio accepts attached JPEG/PNG artwork, preserves bytes and still rejects truncated audio or real video", async () => {
  const dir = await mkdtemp(join(tmpdir(), "file-attached-cover-"));
  try {
    const source = join(dir, "audio.wav"); await writeFile(source, demoAudio(1));
    for (const format of ["png", "jpeg"] as const) {
      const image = join(dir, `cover.${format}`);
      await sharp({ create: { width: 32, height: 32, channels: 3, background: "red" } }).toFormat(format).toFile(image);
      const mp3 = join(dir, `${format}.mp3`);
      execFileSync("ffmpeg", ["-v", "error", "-i", source, "-i", image, "-map", "0:a:0", "-map", "1:v:0", "-c:a", "libmp3lame", "-c:v", "copy", "-disposition:v", "attached_pic", mp3]);
      const originalHash = createHash("sha256").update(await readFile(mp3)).digest("hex");
      const previewPath = join(dir, `${format}.preview.mp3`);
      const result = await validate(mp3, "audio/mpeg", { previewPath });
      assert.equal(result.purpose, "audio"); assert.equal(result.checksumSha256, originalHash);
      assert.ok(result.durationMs! >= 5900 && result.durationMs! <= 6800);
      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", previewPath]).toString());
      assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_type, "audio");
      const truncated = join(dir, `${format}.truncated.mp3`), original = await readFile(mp3);
      // La pochette et les en-têtes restent complets, mais la fin de la piste audio manque.
      await writeFile(truncated, original.subarray(0, Math.floor(original.length / 2)));
      await rejects(validate(truncated, "audio/mpeg"), 415);
    }
    for (const [extension, codec, mime] of [["flac", "flac", "audio/flac"], ["m4a", "aac", "audio/mp4"]]) {
      const file = join(dir, `attached.${extension}`);
      execFileSync("ffmpeg", ["-v", "error", "-i", source, "-i", join(dir, "cover.png"), "-map", "0:a:0", "-map", "1:v:0", "-c:a", codec!, "-c:v", "copy", "-disposition:v", "attached_pic", file]);
      const result = await validate(file, mime!, { previewPath: join(dir, `${extension}.preview.mp3`) });
      assert.equal(result.purpose, "audio"); assert.ok(result.durationMs! > 5900);
    }
    const video = join(dir, "video.mkv");
    execFileSync("ffmpeg", ["-v", "error", "-i", source, "-loop", "1", "-i", join(dir, "cover.png"), "-t", "1", "-map", "0:a:0", "-map", "1:v:0", "-c:a", "pcm_s16le", "-c:v", "ffv1", video]);
    await rejects(validate(video, "audio/x-matroska"), 415, "unsupported_type");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("PNG/JPEG/WebP decode all pixels and enforce dimensions and animation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "file-image-"));
  try {
    for (const format of ["png", "jpeg", "webp"] as const) {
      const path = join(dir, format);
      await sharp({ create: { width: 32, height: 16, channels: 3, background: "red" } }).toFormat(format).toFile(path);
      const result = await validate(path, `image/${format}`);
      assert.equal(result.purpose, "image"); assert.equal(result.width, 32); assert.equal(result.height, 16); assert.equal(result.durationMs, null);
      await rejects(validate(path, "audio/wav"), 415, "mime_mismatch");
    }
    const dimensions = join(dir, "dimensions.png");
    await sharp({ create: { width: 8193, height: 1, channels: 3, background: "red" } }).png().toFile(dimensions);
    await rejects(validate(dimensions, "image/png"), 422, "image_dimensions");
    const pixels = join(dir, "pixels.png");
    await sharp({ create: { width: 5001, height: 5000, channels: 3, background: "red" } }).png().toFile(pixels);
    await rejects(validate(pixels, "image/png"), 422, "image_dimensions");
    const boundary = join(dir, "boundary.png");
    await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "red" } }).png().toFile(boundary);
    await validate(boundary, "image/png");
    const animated = join(dir, "animated.webp");
    const frames = Buffer.alloc(2 * 2 * 3 * 2, 127); frames.fill(255, 12);
    await sharp(frames, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp().toFile(animated);
    await rejects(validate(animated, "image/webp"), 415);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("empty, oversized, signature-only, corrupt, truncated, active and external-reference files fail", async () => {
  const dir = await mkdtemp(join(tmpdir(), "file-refusal-"));
  try {
    const path = join(dir, "input");
    await writeFile(path, ""); await rejects(validate(path, "audio/wav"), 400, "empty_file");
    await writeFile(path, "text renamed mp3"); await rejects(validate(path, "audio/mpeg"), 415);
    await writeFile(path, demoAudio(1).subarray(0, 44)); await rejects(validate(path, "audio/wav"), 415);
    await writeFile(path, demoAudio(1).subarray(0, 1000)); await rejects(validate(path, "audio/wav"), 415);
    const wrongDuration = demoAudio(1); wrongDuration.writeUInt32LE(200_000, 40);
    await writeFile(path, wrongDuration); await rejects(validate(path, "audio/wav"), 415);
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer();
    await writeFile(path, png.subarray(0, 8)); await rejects(validate(path, "image/png"), 415);
    await writeFile(path, png.subarray(0, png.length - 20)); await rejects(validate(path, "image/png"), 415);
    for (const content of ["<svg xmlns='http://www.w3.org/2000/svg'/>", "<html>test</html>",
      "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1\nhttp://127.0.0.1/secret\n", "ffconcat version 1.0\nfile '/etc/passwd'\n"]) {
      await writeFile(path, content); await rejects(validate(path, "application/octet-stream"), 415);
    }
    const sparse = await open(path, "w"); await sparse.truncate(audioByteLimit + 1); await sparse.close();
    await rejects(validate(path, "audio/wav"), 413);
    const image = await open(path, "w"); await image.write(png.subarray(0, 12)); await image.truncate(imageByteLimit + 1); await image.close();
    await rejects(validate(path, "image/png"), 413);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("budgets stop real workers, cancellation cleans the process group, and capacity is bounded", async () => {
  const dir = await mkdtemp(join(tmpdir(), "file-budget-"));
  try {
    const path = join(dir, "audio"); await writeFile(path, demoAudio(1));
    await rejects(validate(path, "audio/wav", { timeMs: 1 }), 422, "processing_limit");
    await rejects(validate(path, "audio/wav", { memoryBytes: 1 }), 422, "processing_limit");
    const ongoing = validate(path, "audio/wav");
    await rejects(createFileValidator()(path, "audio/wav"), 503, "decoder_busy"); await ongoing;
    const controller = new AbortController();
    const aborted = validate(path, "audio/wav", { signal: controller.signal }); controller.abort();
    await rejects(aborted, 400, "upload_aborted");
    await validate(path, "audio/wav");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
