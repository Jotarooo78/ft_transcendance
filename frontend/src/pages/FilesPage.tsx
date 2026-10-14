/** Écran des audios privés : liste paginée, upload confirmé, pochette facultative, écoute et suppression confirmées. */
import { useEffect, useRef, useState } from "react";
import FileUploadForm from "../components/FileUploadForm";
import FilePreview from "../components/FilePreview";
import AudioCover from "../components/AudioCover";
import { replaceAudioCover, removeAudioCover } from "../services/update-audio-cover";
import { validateFile } from "../services/validate-file";
import { readFiles, type FilePage } from "../services/read-files";
import { deleteFile } from "../services/delete-file";
import { getAccessToken } from "../services/session";
import type { ReadyFile } from "../types/files";

/**
 * Présente l’audio, son lecteur facultatif, l’édition de sa pochette et sa suppression ; annule la requête à
 * la disparition de la ligne.
 */
function FileItem({
  file,
  onDeleted,
  onChanged,
}: {
  /** Métadonnées du fichier privé prêt à être affiché. */
  file: ReadyFile;
  /** Appelé après confirmation serveur de la suppression de cet UUID. */
  onDeleted: (id: string) => void;
  /** Remplace les métadonnées de cette seule carte après confirmation serveur. */
  onChanged: (file: ReadyFile) => void;
}) {
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Image choisie pour cette carte ; conservée lorsqu’un remplacement est refusé. */
  const [cover, setCover] = useState<File | null>(null);
  /** Champ image de cette seule carte, vidé après confirmation du changement. */
  const coverInput = useRef<HTMLInputElement | null>(null);
  const current = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      current.current?.abort();
      current.current = null;
    },
    [],
  );
  /**
   * Demande la suppression et appelle onDeleted seulement pour la requête toujours courante après
   * confirmation. Un refus conserve la ligne et l’aperçu.
   */
  async function remove() {
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setError("");
    try {
      await deleteFile(file.id, controller.signal);
      if (current.current === controller) onDeleted(file.id);
    } catch (failure) {
      if (current.current === controller)
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to delete this file.",
        );
    } finally {
      if (current.current === controller) {
        setBusy(false);
        current.current = null;
      }
    }
  }
  /** Ajoute/remplace l’image ou retire son association, sans renvoyer ni effacer l’audio. */
  async function changeCover(remove = false) {
    if (busy || (!remove && !cover)) return;
    const controller = new AbortController(); current.current = controller; setBusy(true); setError("");
    try {
      if (remove) {
        await removeAudioCover(file.id, controller.signal);
        if (current.current === controller) onChanged({ ...file, cover: null });
      } else {
        await validateFile(cover!, controller.signal, "image");
        const saved = await replaceAudioCover(file.id, cover!, controller.signal);
        if (current.current === controller) onChanged({ ...file, cover: saved });
      }
      if (current.current === controller) { setCover(null); if (coverInput.current) coverInput.current.value = ""; }
    } catch (failure) { if (current.current === controller) setError(failure instanceof Error ? failure.message : "Unable to change the cover."); }
    finally { if (current.current === controller) { current.current = null; setBusy(false); } }
  }
  return (
    <li data-file-id={file.id} className="file-card">
      <AudioCover file={file} />
      <h2>Audio</h2>
      <p>
        {file.mimeType} · {(file.byteSize / 1_000_000).toFixed(2)} MB
        {file.durationMs !== null
          ? ` · ${(file.durationMs / 1000).toFixed(1)} s`
          : ""}
      </p>
      <p className="file-id">{file.id}</p>
      <div className="file-actions">
        <button type="button" onClick={() => setPreview((value) => !value)}>
          {preview ? "Close preview" : "Open preview"}
        </button>
        <button type="button" disabled={busy} onClick={() => void remove()}>
          Delete audio
        </button>
      </div>
      <div className="cover-editor">
        <label htmlFor={`cover-${file.id}`}>Cover image</label>
        <input id={`cover-${file.id}`} type="file" accept="image/png,image/jpeg,image/webp" ref={coverInput} disabled={busy} onChange={event => setCover(event.target.files?.[0] ?? null)} />
        <div className="file-actions">
          <button type="button" disabled={busy || !cover} onClick={() => void changeCover()}>{file.cover ? "Replace cover" : "Add cover"}</button>
          {file.cover && <button type="button" disabled={busy} onClick={() => void changeCover(true)}>Remove cover</button>}
        </div>
        {busy && <p role="status">Saving changes…</p>}
      </div>
      {preview && <FilePreview file={file} />}
      {error && (
        <p role="alert" className="message error-message">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * Charge les fichiers du compte par pages de 20 avec annulation et garde de token ; actualise après
 * upload et distingue chargement, refus et page vide.
 */
export default function FilesPage() {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const token = getAccessToken();
  const key = JSON.stringify([token, page, retry]);
  const [result, setResult] = useState<{
    /** Identité de la requête ou de l’état ; empêche d’afficher une réponse devenue périmée. */
    key: string;
    /** Résultat validé ou champs de la commande regroupés par ce contrat. */
    data?: FilePage;
    /** Erreur à rendre visible pour ce résultat ; son absence représente un résultat sans erreur enregistrée. */
    error?: string;
  }>({ key: "" });
  useEffect(() => {
    const controller = new AbortController();
    void readFiles(page, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && token === getAccessToken())
          setResult({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted && token === getAccessToken())
          setResult({
            key,
            error:
              error instanceof Error ? error.message : "Unable to load files.",
          });
      });
    return () => controller.abort();
  }, [key, page, token]);
  const loading = result.key !== key;
  const data = loading ? undefined : result.data;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  /**
   * Retire de la page courante l’UUID confirmé supprimé et décrémente le total, seulement si le compte
   * et la clé de lecture restent courants.
   */
  function deleted(id: string) {
    if (token !== getAccessToken()) return;
    setResult((previous) =>
      previous.key === key && previous.data
        ? {
            ...previous,
            data: {
              ...previous.data,
              items: previous.data.items.filter((file) => file.id !== id),
              total: Math.max(0, previous.data.total - 1),
            },
          }
        : previous,
    );
  }
  /** Garde le total et l’audio existants, tout en affichant la nouvelle pochette confirmée. */
  function changed(file: ReadyFile) {
    if (token !== getAccessToken()) return;
    setResult(previous => previous.key === key && previous.data ? { ...previous, data: { ...previous.data,
      items: previous.data.items.map(item => item.id === file.id ? file : item) } } : previous);
  }
  return (
    <main className="files-page">
      <header>
        <p className="page-label">Your private space</p>
        <h1>My audio</h1>
        <p>Add and listen to your audio, with an optional cover. Your files stay private.</p>
      </header>
      <FileUploadForm
        onReady={() => {
          setPage(1);
          setRetry((value) => value + 1);
        }}
      />
      <section aria-labelledby="saved-files-title">
        <h2 id="saved-files-title">Saved audio</h2>
        <button
          type="button"
          disabled={loading}
          onClick={() => setRetry((value) => value + 1)}
        >
          Refresh files
        </button>
        {loading ? (
          <p role="status">Loading files…</p>
        ) : result.error ? (
          <p role="alert">{result.error}</p>
        ) : (
          <>
            {data?.items.length === 0 && <p>No files on this page.</p>}
            <ul className="file-list">
              {data?.items.map((file) => (
                <FileItem key={file.id} file={file} onDeleted={deleted} onChanged={changed} />
              ))}
            </ul>
            <nav className="pagination" aria-label="File pages">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous page
              </button>
              <span>
                Page {page} of {pages}
              </span>
              <button
                type="button"
                disabled={page >= pages || page >= 9999}
                onClick={() => setPage((value) => value + 1)}
              >
                Next page
              </button>
            </nav>
          </>
        )}
      </section>
    </main>
  );
}
