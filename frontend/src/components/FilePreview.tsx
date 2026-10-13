import { useEffect, useState } from "react";
import { getAccessToken } from "../services/session";
import { readFilePreview } from "../services/read-files";
import type { ReadyFile } from "../types/files";

export default function FilePreview({ file }: { file: ReadyFile }) {
  const [result, setResult] = useState<{ key: string; url?: string; error?: string }>({ key: "" });
  const token = getAccessToken(); const key = JSON.stringify([token, file.id]);
  useEffect(() => {
    const controller = new AbortController(); let url: string | undefined;
    void readFilePreview(file, controller.signal).then(blob => {
      if (controller.signal.aborted || token !== getAccessToken()) return;
      url = URL.createObjectURL(blob); setResult({ key, url });
    }).catch(error => { if (!controller.signal.aborted && token === getAccessToken()) setResult({ key, error: error instanceof Error ? error.message : "Aperçu indisponible." }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [file, key, token]);
  if (result.key !== key) return <p role="status">Chargement de l’aperçu…</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  return file.usage === "image" ? <img className="file-image-preview" src={result.url} alt="Aperçu du fichier envoyé" /> :
    <audio controls preload="metadata" src={result.url} aria-label="Aperçu audio privé" />;
}
