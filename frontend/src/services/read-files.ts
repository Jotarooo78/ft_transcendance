/** Lecture JWT des fichiers et téléchargement borné de leurs aperçus ; le token ne figure jamais dans l’URL. */
import { authenticatedFetch } from "./api";
import { getAccessToken } from "./session";
import {
  audioByteLimit,
  imageByteLimit,
  isReadyFile,
  type ReadyFile,
} from "../types/files";

/** Page de fichiers ready appartenant au compte, avec total et pagination confirmés. */
export type FilePage = {
  /** Éléments de la page ou occurrences de playlist ; le total peut dépasser cette liste. */
  items: ReadyFile[];
  /** Nombre total d’éléments correspondant au filtre, avant la pagination. */
  total: number;
  /** Numéro de page à partir de 1. */
  page: number;
  /** Nombre maximal d’éléments demandé par page, contrôlé par la route. */
  pageSize: number;
};
/**
 * Charge une page de 20 fichiers et valide les métadonnées ; refuse une réponse reçue après annulation
 * ou changement de compte.
 */
export async function readFiles(
  page: number,
  signal: AbortSignal,
): Promise<FilePage> {
  const token = getAccessToken();
  const response = await authenticatedFetch(
    `/api/media/assets?page=${page}&pageSize=20`,
    { signal },
  );
  if (!response.ok)
    throw new Error("Unable to load your files. Please try again.");
  const data = await response.json();
  if (signal.aborted || token !== getAccessToken())
    throw new Error("The signed-in account changed.");
  if (
    !data ||
    !Array.isArray(data.items) ||
    data.items.length > 20 ||
    !data.items.every(isReadyFile) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    data.page !== page ||
    data.pageSize !== 20
  )
    throw new Error("Invalid file list.");
  return data;
}

/**
 * Télécharge l’aperçu MP3 privé avec Authorization. Contrôle MIME, taille
 * annoncée et octets réellement reçus avant de construire le Blob ; annule et libère le lecteur à la
 * sortie.
 */
export async function readFilePreview(
  file: Pick<ReadyFile, "id">,
  signal: AbortSignal,
): Promise<Blob> {
  return readPrivateBlob(`/api/media/assets/${encodeURIComponent(file.id)}/private-content`, "audio/mpeg", audioByteLimit, signal);
}

/** Charge les octets de la pochette actuelle par la route privée de son audio, sans JWT dans l’URL. */
export async function readAudioCover(file: ReadyFile, signal: AbortSignal): Promise<Blob> {
  if (!file.cover) throw new Error("This audio has no cover.");
  return readPrivateBlob(`/api/media/assets/${encodeURIComponent(file.id)}/cover`, file.cover.mimeType, imageByteLimit, signal);
}

/** Lit un contenu privé borné, vérifie ses en-têtes et annule toute réponse d’un ancien compte. */
async function readPrivateBlob(path: string, expected: string | string[], maximum: number, signal: AbortSignal): Promise<Blob> {
  const token = getAccessToken();
  const response = await authenticatedFetch(
    path,
    { signal },
  );
  if (!response.ok || !response.body)
    throw new Error(
      response.status === 404
        ? "This file is no longer available."
        : "Unable to load the preview.",
    );
  const mime = response.headers.get("Content-Type")?.split(";", 1)[0];
  const length = Number(response.headers.get("Content-Length"));
  if (
    (!mime || !(Array.isArray(expected) ? expected.includes(mime) : mime === expected)) ||
    !Number.isSafeInteger(length) ||
    length <= 0 ||
    length > maximum
  ) {
    await response.body.cancel();
    throw new Error("Invalid preview type or size.");
  }
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (signal.aborted || token !== getAccessToken())
        throw new Error("Preview cancelled.");
      size += chunk.value.byteLength;
      if (size > maximum || size > length)
        throw new Error("The preview exceeds the declared size.");
      chunks.push(new Uint8Array(chunk.value).buffer);
    }
  } finally {
    await reader.cancel();
  }
  if (size !== length || signal.aborted || token !== getAccessToken())
    throw new Error("The preview is incomplete or was cancelled.");
  return new Blob(chunks, { type: mime });
}

/** Charge la pochette d’un projet sauvegardé sans demander toutes les métadonnées de ses fichiers. */
export function readProjectArtwork(id: string, signal: AbortSignal): Promise<Blob> {
  return readPrivateBlob(`/api/media/assets/${encodeURIComponent(id)}/cover`, ['image/png','image/jpeg','image/webp'], imageByteLimit, signal);
}
