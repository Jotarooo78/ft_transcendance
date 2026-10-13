import type { ValidatedFile } from "./validate-file.js";

export type StoredFile = {
  id: string; uploaderUserId: string | null; purpose: string; state: string;
  storageKey: string; mimeType: string; byteSize: bigint | null; durationMs: bigint | null;
  checksumSha256: string | null;
};
export type FileVariant = { storageKey: string; mimeType: string; byteSize: bigint };
export type FileStore = {
  create: (id: string, owner: string, file: ValidatedFile, storageKey: string, previewKey?: string) => Promise<StoredFile>;
  hasStorageKey: (key: string) => Promise<boolean>;
};
export type FileReader = {
  list: (owner: string, page: number, pageSize: number) => Promise<{ items: StoredFile[]; total: number }>;
  read: (request: { authenticatedUserId?: string }, id: string) => Promise<(StoredFile & { variants: FileVariant[] }) | null>;
};
export type FileDeletion = {
  read: FileReader["read"];
  markDeleting: (id: string, owner: string) => Promise<boolean>;
  markDeleted: (id: string, owner: string) => Promise<void>;
  pending: (maximum: number) => Promise<Array<StoredFile>>;
  referenced: (id: string) => Promise<boolean>;
};
export function publicFile(file: StoredFile) {
  return { id: file.id, usage: file.purpose === "audio" ? "audio" : "image", state: file.state,
    mimeType: file.mimeType, byteSize: Number(file.byteSize), durationMs: file.durationMs === null ? null : Number(file.durationMs) };
}
