import { randomUUID } from "node:crypto";
import { link, mkdir, open, readdir, lstat, rm, unlink, opendir } from "node:fs/promises";
import { join } from "node:path";
import type { FileStore } from "./file-definitions.js";
import { createFileValidator, FileError } from "./validate-file.js";

const validate = createFileValidator();
const stagingName = /^\.upload-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
async function syncDirectory(path: string) { const directory = await open(path, "r"); try { await directory.sync(); } finally { await directory.close(); } }

async function discardUnstored(storageDir: string, staging: string, id: string, store: FileStore) {
  // An uncertain SQL commit is retained until its outcome can be checked.
  const stored = await store.hasStorageKey(`${id}.original`);
  if (!stored) for (const [source, target] of [["original", `${id}.original`], ["preview.mp3", `${id}.preview.mp3`]]) {
    try {
      const stagedStat = await lstat(join(staging, source!)); const finalStat = await lstat(join(storageDir, target!));
      // Remove only a hard link we installed, never a pre-existing collision.
      if (stagedStat.isFile() && finalStat.isFile() && stagedStat.ino === finalStat.ino && stagedStat.dev === finalStat.dev) await unlink(join(storageDir, target!));
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  await rm(staging, { recursive: true }); await syncDirectory(storageDir);
}

// Call once, before listening; restarting the instance stops previous uploads.
export async function recoverUploads(storageDir: string, store: FileStore, maximum = 1000) {
  await mkdir(storageDir, { recursive: true }); let recovered = 0;
  const directory = await opendir(storageDir);
  for await (const entry of directory) {
    const match = stagingName.exec(entry.name);
    if (!entry.isDirectory() || !match) continue;
    if (recovered >= maximum) throw new FileError(503, "upload_recovery_limit");
    const staging = join(storageDir, entry.name);
    const children = await readdir(staging);
    if (children.some(name => name !== "original" && name !== "preview.mp3")) throw new FileError(503, "upload_recovery_invalid");
    await discardUnstored(storageDir, staging, match[1]!, store); recovered++;
  }
  return recovered;
}

export async function saveFile(storageDir: string, owner: string, store: FileStore,
  receive: (path: string) => Promise<string>, signal?: AbortSignal) {
  const id = randomUUID(); const staging = join(storageDir, `.upload-${id}`);
  try { await mkdir(staging, { mode: 0o700 }); } catch { throw new FileError(503, "file_storage_unavailable"); }
  let installed = false;
  try {
    const source = join(staging, "original"); const preview = join(staging, "preview.mp3");
    const mime = await receive(source);
    if (signal?.aborted) throw new FileError(400, "upload_aborted");
    const file = await validate(source, mime, { signal, previewPath: preview });
    if (signal?.aborted) throw new FileError(400, "upload_aborted");
    const storageKey = `${id}.original`; const previewKey = file.purpose === "audio" ? `${id}.preview.mp3` : undefined;
    await syncDirectory(staging);
    await link(source, join(storageDir, storageKey)); installed = true;
    if (previewKey) await link(preview, join(storageDir, previewKey));
    await syncDirectory(storageDir);
    const asset = await store.create(id, owner, file, storageKey, previewKey);
    // A confirmed SQL commit stays ready even if only marker cleanup fails.
    await rm(staging, { recursive: true }).catch(() => {});
    return asset;
  } catch (error) {
    if (installed) await discardUnstored(storageDir, staging, id, store).catch(() => { /* durable marker remains for startup recovery */ });
    else await rm(staging, { recursive: true }).catch(() => {});
    if (error instanceof FileError) throw error;
    const code = (error as NodeJS.ErrnoException).code ?? "";
    if (code.startsWith("FST_")) throw new FileError(code === "FST_REQ_FILE_TOO_LARGE" ? 413 : 400, "invalid_multipart");
    if (signal?.aborted) throw new FileError(400, "upload_aborted");
    throw new FileError(503, "file_storage_unavailable");
  }
}
