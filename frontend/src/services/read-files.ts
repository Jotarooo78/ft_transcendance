import { authenticatedFetch } from "./api";
import { getAccessToken } from "./session";
import { audioByteLimit, imageByteLimit, isReadyFile, type ReadyFile } from "../types/files";

export type FilePage = { items: ReadyFile[]; total: number; page: number; pageSize: number };
export async function readFiles(page: number, signal: AbortSignal): Promise<FilePage> {
  const token = getAccessToken();
  const response = await authenticatedFetch(`/api/media/assets?page=${page}&pageSize=20`, { signal });
  if (!response.ok) throw new Error("Impossible de charger vos fichiers. Réessayez.");
  const data = await response.json();
  if (signal.aborted || token !== getAccessToken()) throw new Error("Compte changé.");
  if (!data || !Array.isArray(data.items) || data.items.length > 20 || !data.items.every(isReadyFile) ||
    !Number.isSafeInteger(data.total) || data.total < 0 || data.page !== page || data.pageSize !== 20) throw new Error("Liste de fichiers invalide.");
  return data;
}

export async function readFilePreview(file: ReadyFile, signal: AbortSignal): Promise<Blob> {
  const token = getAccessToken();
  const response = await authenticatedFetch(`/api/media/assets/${encodeURIComponent(file.id)}/private-content`, { signal });
  if (!response.ok || !response.body) throw new Error(response.status === 404 ? "Ce fichier n’est plus disponible." : "Impossible de charger l’aperçu.");
  const mime = response.headers.get("Content-Type")?.split(";", 1)[0];
  const expected = file.usage === "audio" ? "audio/mpeg" : file.mimeType;
  const maximum = file.usage === "audio" ? audioByteLimit : imageByteLimit;
  const length = Number(response.headers.get("Content-Length"));
  if (mime !== expected || !Number.isSafeInteger(length) || length <= 0 || length > maximum) {
    await response.body.cancel(); throw new Error("Type ou taille d’aperçu invalide.");
  }
  const reader = response.body.getReader(); const chunks: BlobPart[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      if (signal.aborted || token !== getAccessToken()) throw new Error("Aperçu annulé.");
      size += chunk.value.byteLength;
      if (size > maximum || size > length) throw new Error("L’aperçu dépasse la taille annoncée.");
      chunks.push(new Uint8Array(chunk.value).buffer);
    }
  } finally { await reader.cancel(); }
  if (size !== length || signal.aborted || token !== getAccessToken()) throw new Error("Aperçu incomplet ou annulé.");
  return new Blob(chunks, { type: expected });
}
