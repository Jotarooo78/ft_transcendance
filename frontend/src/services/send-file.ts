/** Upload authentifié XHR pour mesurer les octets réellement transmis et distinguer transfert et validation serveur. */
import { getAccessToken, clearAccessToken, onSessionCleared } from "./session";
import {
  isReadyFile,
  type ReadyFile,
  type UploadProgress,
} from "../types/files";

/**
 * Envoie un unique champ multipart file avec le token capturé. Publie la progression réelle puis
 * l’état validating ; résout seulement après 201 et métadonnées ready valides. Annule si la session
 * change et traite les refus sans inventer de réussite.
 * @param file Original sélectionné.
 * @param progress Réception des états de transfert et de validation.
 * @param signal Annulation de cet envoi.
 * @returns Fichier confirmé par le serveur, ou promesse rejetée avec un message public.
 */
export function sendFile(
  file: File,
  progress: (value: UploadProgress) => void,
  signal: AbortSignal,
): Promise<ReadyFile> {
  const token = getAccessToken();
  if (!token) return Promise.reject(new Error("Sign in to upload a file."));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/assets");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = 900_000;
    /** Interrompt la requête XHR active lors d’une annulation ou d’une perte de session. */
    const abort = () => xhr.abort();
    const unsubscribe = onSessionCleared(abort);
    /** Retire les abonnements à l’annulation pour éviter de conserver la requête terminée. */
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      unsubscribe();
    };
    xhr.upload.onprogress = (event) => {
      if (signal.aborted || token !== getAccessToken()) {
        abort();
        return;
      }
      progress({
        phase: "sending",
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : null,
        percent: event.lengthComputable
          ? Math.min(100, Math.round((100 * event.loaded) / event.total))
          : null,
      });
    };
    xhr.upload.onload = () => {
      if (!signal.aborted && token === getAccessToken())
        progress({
          phase: "validating",
          percent: 100,
          loaded: file.size,
          total: file.size,
        });
    };
    xhr.onload = () => {
      cleanup();
      if (signal.aborted || token !== getAccessToken())
        return reject(
          new Error("Upload cancelled because the session changed."),
        );
      if (xhr.status === 401) {
        if (getAccessToken() === token) clearAccessToken();
        return reject(new Error("Your session expired. Please sign in again."));
      }
      let data: unknown;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        return reject(
          new Error(
            "Invalid server response. Refresh your files before trying again.",
          ),
        );
      }
      if (xhr.status !== 201 || !isReadyFile(data)) {
        const messages: Record<number, string> = {
          400: "Invalid upload or empty file.",
          409: "This file is currently in use.",
          413: "The file exceeds the allowed size.",
          415: "This audio format is not supported.",
          422: "Image dimensions or processing limits exceeded.",
          503: "The service is busy or unavailable. Please try again.",
        };
        return reject(
          new Error(
            ((data as { error?: string })?.error === "audio_required" ? "Choose an audio file. Images are only covers." :
              ["invalid_file", "invalid_duration"].includes((data as { error?: string })?.error ?? "") ? "The audio is corrupted or cannot be decoded." :
              (data as { error?: string })?.error === "mime_mismatch" ? "The declared audio type does not match its content." : messages[xhr.status]) ??
              "The file was not confirmed as ready. Refresh the list before trying again.",
          ),
        );
      }
      resolve(data);
    };
    xhr.onerror = () => {
      cleanup();
      reject(
        new Error(
          "The network interrupted the upload. Refresh the list before trying again.",
        ),
      );
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(
        new Error(
          "The upload timed out. Refresh the list before trying again.",
        ),
      );
    };
    xhr.onabort = () => {
      cleanup();
      reject(new Error("Upload cancelled."));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      cleanup();
      reject(new Error("Upload cancelled."));
      return;
    }
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
