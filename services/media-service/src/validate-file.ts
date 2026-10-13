import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, readFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const audioByteLimit = 500_000_000;
export const imageByteLimit = 25_000_000;
export type ValidatedFile = {
  purpose: "audio" | "image"; mimeType: string; byteSize: number;
  checksumSha256: string; durationMs: number | null; width?: number; height?: number;
  previewByteSize?: number;
};
export class FileError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
let busy = false;

// Linux /proc includes the isolated JS worker and every decoder descendant.
async function residentBytes(pid: number): Promise<number> {
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    const children = await readFile(`/proc/${pid}/task/${pid}/children`, "utf8");
    const own = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) * 1024;
    const descendants = await Promise.all(children.trim().split(/\s+/).filter(Boolean).map(value => residentBytes(Number(value))));
    return own + descendants.reduce((sum, value) => sum + value, 0);
  } catch (error) {
    if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) return 0;
    throw error;
  }
}

export function createFileValidator() {
  return async (path: string, declaredMime: string, limits?: { timeMs?: number; memoryBytes?: number; signal?: AbortSignal; previewPath?: string }): Promise<ValidatedFile> => {
    if (busy) throw new FileError(503, "decoder_busy");
    if (process.platform !== "linux") throw new FileError(503, "decoder_unavailable");
    busy = true;
    try {
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let image = false;
      try {
        const stat = await file.stat();
        if (!stat.isFile()) throw new FileError(415, "invalid_file");
        if (!stat.size) throw new FileError(400, "empty_file");
        if (stat.size > audioByteLimit) throw new FileError(413, "file_too_large");
        const header = Buffer.alloc(12);
        await file.read(header, 0, header.length, 0);
        image = header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
          (header[0] === 255 && header[1] === 216) || (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP");
        if (image && stat.size > imageByteLimit) throw new FileError(413, "file_too_large");
      } finally { await file.close(); }
      const timeMs = Math.min(limits?.timeMs ?? Infinity, image ? 30_000 : 300_000);
      const memoryBytes = Math.min(limits?.memoryBytes ?? Infinity, image ? 268_435_456 : 536_870_912);
      return await new Promise<ValidatedFile>((resolve, reject) => {
        const worker = spawn(process.execPath, ["--max-old-space-size=64", fileURLToPath(new URL("./decode-file.js", import.meta.url)), path, declaredMime, limits?.previewPath ?? ""],
          { detached: true, stdio: ["ignore", "pipe", "ignore"], env: { PATH: process.env.PATH, NODE_ENV: "production" } });
        let output = ""; let failure: FileError | undefined; let finished = false; let inspecting = false;
        const stop = (error: FileError) => {
          failure ??= error;
          if (worker.pid) { try { process.kill(-worker.pid, "SIGKILL"); } catch { /* already exited */ } }
        };
        const abort = () => stop(new FileError(400, "upload_aborted"));
        const timer = setTimeout(() => stop(new FileError(422, "processing_limit")), timeMs);
        const monitor = setInterval(async () => {
          if (finished || inspecting || !worker.pid) return;
          inspecting = true;
          try {
            if (await residentBytes(worker.pid) > memoryBytes && !finished) stop(new FileError(422, "processing_limit"));
            if (limits?.previewPath) {
              const preview = await lstat(limits.previewPath).catch(error => { if (error.code === "ENOENT") return null; throw error; });
              if (preview && preview.size > audioByteLimit && !finished) stop(new FileError(422, "preview_too_large"));
            }
          }
          catch { if (!finished) stop(new FileError(503, "decoder_unavailable")); }
          finally { inspecting = false; }
        }, 20);
        limits?.signal?.addEventListener("abort", abort, { once: true });
        if (limits?.signal?.aborted) abort();
        worker.stdout.on("data", chunk => { output += String(chunk); if (output.length > 8192) stop(new FileError(415, "invalid_file")); });
        worker.on("error", () => { failure = new FileError(503, "decoder_unavailable"); });
        worker.on("close", () => {
          finished = true; clearTimeout(timer); clearInterval(monitor); limits?.signal?.removeEventListener("abort", abort);
          if (failure) return reject(failure);
          try {
            const result = JSON.parse(output);
            if (result.error) return reject(new FileError(result.status, result.error));
            if (!Number.isSafeInteger(result.byteSize) || !/^[a-f0-9]{64}$/.test(result.checksumSha256)) throw new Error("Invalid result");
            resolve(result);
          } catch { reject(new FileError(415, "invalid_file")); }
        });
      });
    } catch (error) { if (error instanceof FileError) throw error; throw new FileError(503, "storage_unavailable"); }
    finally { busy = false; }
  };
}
