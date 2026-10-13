import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import sharp from "sharp";
import { FileError, audioByteLimit, imageByteLimit } from "./validate-file.js";

// This executable runs in its own process group under validate-file's budget.
sharp.cache(false); sharp.concurrency(1);
const path = process.argv[2]!;
const declared = process.argv[3]!.split(";", 1)[0]!.trim().toLowerCase();

async function runDecoder(command: string, args: string[], countOnly = false): Promise<{ text: string; bytes: number }> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    return await new Promise((resolve, reject) => {
      // fd is seekable; file, network and playlist protocols remain forbidden.
      const child = spawn(command, ["-v", "error", "-protocol_whitelist", "fd", "-fd", "3", ...args],
        { stdio: ["ignore", "pipe", "pipe", file.fd] });
      let text = ""; let bytes = 0; let errors = ""; let overflow = false;
      child.stdout!.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (!countOnly) { text += chunk.toString(); if (text.length > 1_048_576) { overflow = true; child.kill("SIGKILL"); } }
      });
      child.stderr!.on("data", chunk => { if (errors.length < 8192) errors += String(chunk); });
      child.on("error", () => reject(new FileError(503, "decoder_unavailable")));
      child.on("close", code => code === 0 && !errors && !overflow ? resolve({ text, bytes }) : reject(new FileError(415, "invalid_file")));
    });
  } finally { await file.close(); }
}

async function decode() {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let size: number; let header: Buffer; let checksum: string;
  try {
    const stat = await file.stat(); size = stat.size;
    if (!stat.isFile()) throw new FileError(415, "invalid_file");
    if (!size) throw new FileError(400, "empty_file");
    if (size > audioByteLimit) throw new FileError(413, "file_too_large");
    header = Buffer.alloc(12); await file.read(header, 0, 12, 0);
    const hash = createHash("sha256");
    for await (const chunk of file.createReadStream({ start: 0, autoClose: false })) hash.update(chunk);
    checksum = hash.digest("hex");
  } finally { await file.close(); }
  const common = { byteSize: size, checksumSha256: checksum };
  const imageFormat = header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png" :
    header[0] === 255 && header[1] === 216 ? "jpeg" : header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP" ? "webp" : null;
  if (imageFormat) {
    if (size > imageByteLimit) throw new FileError(413, "file_too_large");
    const mimeType = `image/${imageFormat}`;
    if (declared !== mimeType && declared !== "application/octet-stream") throw new FileError(415, "mime_mismatch");
    // Read metadata without pixel allocation, then enforce both dimensional bounds.
    const image = sharp(path, { failOn: "warning", limitInputPixels: false, animated: true });
    const meta = await image.metadata();
    const width = meta.width ?? 0; const height = meta.height ?? 0;
    if (!width || !height || width > 8192 || height > 8192 || width * height > 25_000_000) throw new FileError(422, "image_dimensions");
    if (meta.format !== imageFormat || (meta.pages ?? 1) !== 1) throw new FileError(415, "invalid_file");
    // stats walks every decoded pixel without retaining a raw image buffer.
    await image.stats();
    return { ...common, purpose: "image", mimeType, durationMs: null, width, height };
  }
  if (!declared.startsWith("audio/") && declared !== "application/octet-stream") throw new FileError(415, "unsupported_type");
  const probe = JSON.parse((await runDecoder("ffprobe", ["-show_streams", "-show_format", "-of", "json", "fd:"])).text);
  if (!Array.isArray(probe.streams) || probe.streams.length !== 1 || probe.streams[0].codec_type !== "audio") throw new FileError(415, "unsupported_type");
  const format = String(probe.format?.format_name ?? "").split(",")[0]!;
  if (!/^[a-z0-9_]+$/.test(format) || ["hls", "concat", "dash", "image2", "image2pipe", "sdp"].includes(format)) throw new FileError(415, "unsupported_type");
  const mimes: Record<string, string[]> = {
    wav: ["audio/wav", "audio/x-wav", "audio/wave"], flac: ["audio/flac", "audio/x-flac"], mp3: ["audio/mpeg", "audio/mp3"],
    aac: ["audio/aac", "audio/x-aac"], mov: ["audio/mp4", "audio/x-m4a", "audio/m4a"],
    ogg: ["audio/ogg", "audio/opus"], matroska: ["audio/webm", "audio/x-matroska"], aiff: ["audio/aiff", "audio/x-aiff"],
    asf: ["audio/x-ms-wma"], amr: ["audio/amr"], ac3: ["audio/ac3"], au: ["audio/basic"],
  };
  const aliases = mimes[format] ?? [`audio/x-${format}`];
  if (declared !== "application/octet-stream" && !aliases.includes(declared)) throw new FileError(415, "mime_mismatch");
  const decoded = await runDecoder("ffmpeg", ["-nostdin", "-xerror", "-err_detect", "explode", "-threads", "1", "-f", format, "-i", "fd:",
    "-map", "0:a:0", "-threads", "1", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"], true);
  const durationMs = Math.round(decoded.bytes / 16);
  const advertised = Number(probe.streams[0].duration ?? probe.format?.duration) * 1000;
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0 ||
    (Number.isFinite(advertised) && Math.abs(advertised - durationMs) > Math.max(250, advertised * 0.02))) throw new FileError(415, "invalid_duration");
  return { ...common, purpose: "audio", mimeType: aliases[0], durationMs };
}

try { process.stdout.write(JSON.stringify(await decode())); }
catch (error) {
  const failure = error instanceof FileError ? error : new FileError(415, "invalid_file");
  process.stdout.write(JSON.stringify({ error: failure.code, status: failure.status }));
}
