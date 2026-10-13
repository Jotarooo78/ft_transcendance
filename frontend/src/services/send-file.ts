/** Upload authentifié XHR pour mesurer les octets réellement transmis et distinguer transfert et validation serveur. */
import { getAccessToken, clearAccessToken, onSessionCleared } from "./session";
import { isReadyFile, type ReadyFile, type UploadProgress } from "../types/files";

/**
 * Envoie un unique champ multipart file avec le token capturé. Publie la progression réelle puis
 * l’état validating ; résout seulement après 201 et métadonnées ready valides. Annule si la session
 * change et traite les refus sans inventer de réussite.
 * @param file Original sélectionné.
 * @param progress Réception des états de transfert et de validation.
 * @param signal Annulation de cet envoi.
 * @returns Fichier confirmé par le serveur, ou promesse rejetée avec un message public.
 */
export function sendFile(file: File, progress: (value: UploadProgress) => void, signal: AbortSignal): Promise<ReadyFile> {
  const token = getAccessToken();
  if (!token) return Promise.reject(new Error("Connectez-vous pour envoyer un fichier."));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/media/assets");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`); xhr.timeout = 900_000;
    /** Interrompt la requête XHR active lors d’une annulation ou d’une perte de session. */
    const abort = () => xhr.abort(); const unsubscribe = onSessionCleared(abort);
    /** Retire les abonnements à l’annulation pour éviter de conserver la requête terminée. */
    const cleanup = () => { signal.removeEventListener("abort", abort); unsubscribe(); };
    xhr.upload.onprogress = event => {
      if (signal.aborted || token !== getAccessToken()) { abort(); return; }
      progress({ phase: "sending", loaded: event.loaded, total: event.lengthComputable ? event.total : null,
        percent: event.lengthComputable ? Math.min(100, Math.round(100 * event.loaded / event.total)) : null });
    };
    xhr.upload.onload = () => { if (!signal.aborted && token === getAccessToken()) progress({ phase: "validating", percent: 100, loaded: file.size, total: file.size }); };
    xhr.onload = () => {
      cleanup();
      if (signal.aborted || token !== getAccessToken()) return reject(new Error("Envoi annulé après un changement de session."));
      if (xhr.status === 401) { if (getAccessToken() === token) clearAccessToken(); return reject(new Error("Session expirée. Reconnectez-vous.")); }
      let data: unknown; try { data = JSON.parse(xhr.responseText); } catch { return reject(new Error("Réponse serveur invalide. Rechargez vos fichiers avant de réessayer.")); }
      if (xhr.status !== 201 || !isReadyFile(data)) {
        const messages: Record<number, string> = { 400: "Envoi invalide ou fichier vide.", 409: "Ce fichier est utilisé.", 413: "Le fichier dépasse la taille autorisée.", 415: "Contenu invalide, corrompu ou format non pris en charge.", 422: "Dimensions ou budget de traitement dépassés.", 503: "Service occupé ou indisponible. Réessayez." };
        return reject(new Error(messages[xhr.status] ?? "Le fichier n’a pas été confirmé prêt. Rechargez la liste avant de réessayer."));
      }
      resolve(data);
    };
    xhr.onerror = () => { cleanup(); reject(new Error("Envoi interrompu par le réseau. Rechargez la liste avant de réessayer.")); };
    xhr.ontimeout = () => { cleanup(); reject(new Error("Délai d’envoi dépassé. Rechargez la liste avant de réessayer.")); };
    xhr.onabort = () => { cleanup(); reject(new Error("Envoi annulé.")); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { cleanup(); reject(new Error("Envoi annulé.")); return; }
    const form = new FormData(); form.append("file", file); xhr.send(form);
  });
}
