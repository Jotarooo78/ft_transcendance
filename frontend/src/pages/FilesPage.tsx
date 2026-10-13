import { useEffect, useRef, useState } from "react";
import FileUploadForm from "../components/FileUploadForm";
import FilePreview from "../components/FilePreview";
import { readFiles, type FilePage } from "../services/read-files";
import { deleteFile } from "../services/delete-file";
import { getAccessToken } from "../services/session";
import type { ReadyFile } from "../types/files";

function FileItem({ file, onDeleted }: { file: ReadyFile; onDeleted: (id: string) => void }) {
  const [preview, setPreview] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => { current.current?.abort(); current.current = null; }, []);
  async function remove() {
    const controller = new AbortController(); current.current = controller; setBusy(true); setError("");
    try { await deleteFile(file.id, controller.signal); if (current.current === controller) onDeleted(file.id); }
    catch (failure) { if (current.current === controller) setError(failure instanceof Error ? failure.message : "Suppression impossible."); }
    finally { if (current.current === controller) { setBusy(false); current.current = null; } }
  }
  return <li data-file-id={file.id} className="file-card">
    <h2>{file.usage === "image" ? "Image" : "Audio"}</h2>
    <p>{file.mimeType} · {(file.byteSize / 1_000_000).toFixed(2)} Mo{file.durationMs !== null ? ` · ${(file.durationMs / 1000).toFixed(1)} s` : ""}</p>
    <p className="file-id">{file.id}</p>
    <div className="file-actions"><button type="button" onClick={() => setPreview(value => !value)}>{preview ? "Fermer l’aperçu" : "Ouvrir l’aperçu"}</button>
      <button type="button" disabled={busy} onClick={() => void remove()}>{busy ? "Suppression…" : "Supprimer le fichier"}</button></div>
    {preview && <FilePreview file={file} />}
    {error && <p role="alert" className="message error-message">{error}</p>}
  </li>;
}

export default function FilesPage() {
  const [page, setPage] = useState(1); const [retry, setRetry] = useState(0);
  const token = getAccessToken(); const key = JSON.stringify([token, page, retry]);
  const [result, setResult] = useState<{ key: string; data?: FilePage; error?: string }>({ key: "" });
  useEffect(() => {
    const controller = new AbortController();
    void readFiles(page, controller.signal).then(data => { if (!controller.signal.aborted && token === getAccessToken()) setResult({ key, data }); })
      .catch(error => { if (!controller.signal.aborted && token === getAccessToken()) setResult({ key, error: error instanceof Error ? error.message : "Chargement impossible." }); });
    return () => controller.abort();
  }, [key, page, token]);
  const loading = result.key !== key; const data = loading ? undefined : result.data;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  function deleted(id: string) {
    if (token !== getAccessToken()) return;
    setResult(previous => previous.key === key && previous.data ? { ...previous, data: { ...previous.data,
      items: previous.data.items.filter(file => file.id !== id), total: Math.max(0, previous.data.total - 1) } } : previous);
  }
  return <main className="files-page">
    <header><p className="page-label">Votre espace privé</p><h1>Mes fichiers</h1><p>Envoyez, prévisualisez et supprimez vos audios et images. Retrouvez-les en vous connectant depuis un autre appareil.</p></header>
    <FileUploadForm onReady={() => { setPage(1); setRetry(value => value + 1); }} />
    <section aria-labelledby="saved-files-title"><h2 id="saved-files-title">Fichiers conservés</h2>
      <button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)}>Actualiser les fichiers</button>
      {loading ? <p role="status">Chargement des fichiers…</p> : result.error ? <p role="alert">{result.error}</p> : <>
        {data?.items.length === 0 && <p>Aucun fichier sur cette page.</p>}
        <ul className="file-list">{data?.items.map(file => <FileItem key={file.id} file={file} onDeleted={deleted} />)}</ul>
        <nav className="pagination" aria-label="Pages des fichiers"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Page précédente</button>
          <span>Page {page} sur {pages}</span><button type="button" disabled={page >= pages || page >= 9999} onClick={() => setPage(value => value + 1)}>Page suivante</button></nav>
      </>}
    </section>
  </main>;
}
