/** Formulaire d’upload : prévalidation, progression mesurée, annulation et confirmation serveur distinctes. */
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { validateFile } from "../services/validate-file";
import { sendFile } from "../services/send-file";
import { replaceAudioCover } from "../services/update-audio-cover";
import type { ReadyFile, UploadProgress } from "../types/files";

/**
 * Gère la sélection et le transfert ; conserve le fichier sélectionné en cas de refus, annule au
 * nettoyage et appelle onReady seulement après confirmation.
 */
export default function FileUploadForm({
  onReady,
}: {
  /** Appelé uniquement après confirmation du fichier ready par le serveur. */
  onReady?: (file: ReadyFile) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [checking, setChecking] = useState(false);
  const current = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const coverInput = useRef<HTMLInputElement | null>(null);
  useEffect(
    () => () => {
      current.current?.abort();
      current.current = null;
    },
    [],
  );
  const busy = checking || progress !== null || coverBusy;
  /**
   * Empêche une soumission concurrente, prévalide le fichier puis lance XHR. Affiche le refus ou la
   * confirmation et libère l’opération courante à la sortie.
   */
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const controller = new AbortController();
    current.current = controller;
    setError("");
    setMessage("");
    setChecking(true);
    try {
      await validateFile(file, controller.signal);
      if (current.current !== controller || controller.signal.aborted) return;
      setChecking(false);
      setProgress({ phase: "sending", percent: 0, loaded: 0, total: null });
      const asset = await sendFile(
        file,
        (value) => {
          if (current.current === controller) setProgress(value);
        },
        controller.signal,
      );
      if (current.current !== controller || controller.signal.aborted) return;
      setMessage(asset.warning ? "Audio saved. Its embedded cover could not be used; you can add another cover." : "Audio saved on the server.");
      setFile(null);
      if (input.current) input.current.value = "";
      onReady?.(asset);
      if (cover) {
        setProgress(null); setCoverBusy(true);
        try {
          await validateFile(cover, controller.signal, "image");
          const savedCover = await replaceAudioCover(asset.id, cover, controller.signal);
          if (current.current !== controller || controller.signal.aborted) return;
          onReady?.({ ...asset, cover: savedCover, warning: undefined });
          setMessage("Audio and cover saved on the server.");
        } catch (failure) {
          if (current.current === controller) setError(`Audio saved. The cover was not confirmed: ${failure instanceof Error ? failure.message : "Please retry the cover from the audio card."}`);
        }
      }
      setCover(null); if (coverInput.current) coverInput.current.value = "";
    } catch (failure) {
      if (current.current === controller)
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to upload the file.",
        );
    } finally {
      if (current.current === controller) {
        setChecking(false);
        setCoverBusy(false);
        setProgress(null);
        current.current = null;
      }
    }
  }
  return (
    <form className="file-upload-form" onSubmit={submit}>
      <label htmlFor="private-file">Audio file</label>
      <input
        id="private-file"
        type="file"
        accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.aiff,.wma"
        ref={input}
        disabled={busy}
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setError("");
          setMessage("");
        }}
      />
      <label htmlFor="optional-cover">Cover image (optional)</label>
      <input id="optional-cover" type="file" accept="image/png,image/jpeg,image/webp" ref={coverInput} disabled={busy} onChange={event => setCover(event.target.files?.[0] ?? null)} />
      <p className="field-help">
        Audio: 500 MB. Embedded artwork is used automatically. Optional PNG, JPEG or WebP cover: 25 MB, 25 million pixels, 8,192 pixels per side.
      </p>
      <button type="submit" disabled={!file || busy}>
        Add audio
      </button>
      {busy && (
        <button type="button" onClick={() => current.current?.abort()}>
          Cancel upload
        </button>
      )}
      <div aria-live="polite">
        {checking && <p>Checking the file on this device…</p>}
        {coverBusy && <><progress aria-label="Cover upload" /><p>Audio saved. Checking and adding its cover…</p></>}
        {progress?.phase === "sending" && (
          <>
            <progress
              aria-label="Upload progress"
              max={100}
              {...(progress.percent === null
                ? {}
                : { value: progress.percent })}
            />
            <p>
              {progress.percent === null
                ? "Uploading…"
                : `${progress.percent}% uploaded`}{" "}
              — {progress.loaded.toLocaleString("en-US")} bytes transferred
            </p>
          </>
        )}
        {progress?.phase === "validating" && (
          <p>Upload complete. Validating and storing the file on the server…</p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
      {error && (
        <p role="alert" className="message error-message">
          {error}
        </p>
      )}
    </form>
  );
}
