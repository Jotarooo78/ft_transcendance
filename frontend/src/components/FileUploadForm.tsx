/** Formulaire d’upload : prévalidation, progression mesurée, annulation et confirmation serveur distinctes. */
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { validateFile } from "../services/validate-file";
import { sendFile } from "../services/send-file";
import type { ReadyFile, UploadProgress } from "../types/files";

/**
 * Gère la sélection et le transfert ; conserve le fichier sélectionné en cas de refus, annule au
 * nettoyage et appelle onReady seulement après confirmation.
 */
export default function FileUploadForm({ onReady }: {
  /** Appelé uniquement après confirmation du fichier ready par le serveur. */
  onReady?: (file: ReadyFile) => void }) {
  const [file, setFile] = useState<File | null>(null); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [progress, setProgress] = useState<UploadProgress | null>(null); const [checking, setChecking] = useState(false);
  const current = useRef<AbortController | null>(null); const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => { current.current?.abort(); current.current = null; }, []);
  const busy = checking || progress !== null;
  /**
   * Empêche une soumission concurrente, prévalide le fichier puis lance XHR. Affiche le refus ou la
   * confirmation et libère l’opération courante à la sortie.
   */
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file || busy) return;
    const controller = new AbortController(); current.current = controller;
    setError(""); setMessage(""); setChecking(true);
    try {
      await validateFile(file, controller.signal);
      if (current.current !== controller || controller.signal.aborted) return;
      setChecking(false); setProgress({ phase: "sending", percent: 0, loaded: 0, total: null });
      const asset = await sendFile(file, value => { if (current.current === controller) setProgress(value); }, controller.signal);
      if (current.current !== controller || controller.signal.aborted) return;
      setMessage("Fichier prêt et conservé sur le serveur."); setFile(null); if (input.current) input.current.value = ""; onReady?.(asset);
    } catch (failure) { if (current.current === controller) setError(failure instanceof Error ? failure.message : "Envoi impossible."); }
    finally { if (current.current === controller) { setChecking(false); setProgress(null); current.current = null; } }
  }
  return <form className="file-upload-form" onSubmit={submit}>
    <label htmlFor="private-file">Choisir un fichier audio ou une image</label>
    <input id="private-file" type="file" ref={input} disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(""); setMessage(""); }} />
    <p className="field-help">Audio : 500 Mo. PNG, JPEG ou WebP : 25 Mo, 25 millions de pixels, 8 192 pixels par côté.</p>
    <button type="submit" disabled={!file || busy}>Envoyer le fichier</button>
    {busy && <button type="button" onClick={() => current.current?.abort()}>Annuler l’envoi</button>}
    <div aria-live="polite">
      {checking && <p>Vérification du fichier sur cet appareil…</p>}
      {progress?.phase === "sending" && <><progress aria-label="Progression de l’envoi" max={100} {...(progress.percent === null ? {} : { value: progress.percent })} /><p>{progress.percent === null ? "Envoi en cours…" : `${progress.percent} % envoyé`} — {progress.loaded.toLocaleString("fr-FR")} octets transmis</p></>}
      {progress?.phase === "validating" && <p>Envoi terminé. Validation et enregistrement sur le serveur…</p>}
      {message && <p role="status">{message}</p>}
    </div>
    {error && <p role="alert" className="message error-message">{error}</p>}
  </form>;
}
