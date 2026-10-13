import { lstat, unlink, open } from "node:fs/promises";
import { join } from "node:path";
import type { FileDeletion } from "./file-definitions.js";
import { FileError } from "./validate-file.js";

export async function deleteFile(storageDir: string, files: FileDeletion, request: { authenticatedUserId?: string }, id: string) {
  const asset = await files.read(request, id);
  if (!asset || asset.uploaderUserId !== request.authenticatedUserId || !asset.uploaderUserId || !["audio", "cover"].includes(asset.purpose)) throw new FileError(404, "file_not_found");
  if (asset.state === "deleted") return;
  if (asset.state !== "ready" && asset.state !== "deleting") throw new FileError(404, "file_not_found");
  if (await files.referenced(id)) throw new FileError(409, "file_in_use");
  if (asset.state === "ready" && !await files.markDeleting(id, asset.uploaderUserId)) {
    const current = await files.read(request, id);
    if (current?.state === "deleted") return;
    if (current?.state !== "deleting") throw new FileError(404, "file_not_found");
  }
  for (const key of [asset.storageKey, ...asset.variants.map(variant => variant.storageKey)]) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(key)) throw new FileError(503, "file_storage_unavailable");
    try {
      const path = join(storageDir, key); const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new FileError(503, "file_storage_unavailable");
      await unlink(path);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const directory = await open(storageDir, "r"); try { await directory.sync(); } finally { await directory.close(); }
  await files.markDeleted(id, asset.uploaderUserId);
}

export async function recoverDeletions(storageDir: string, files: FileDeletion, maximum = 1000) {
  const pending = await files.pending(maximum + 1);
  for (const asset of pending.slice(0, maximum)) await deleteFile(storageDir, files, { authenticatedUserId: asset.uploaderUserId! }, asset.id);
  if (pending.length > maximum) throw new FileError(503, "deletion_recovery_limit");
  return pending.length;
}
