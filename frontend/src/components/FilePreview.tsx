/** Aperçu privé chargé à la demande avec un Blob authentifié et une URL locale temporaire. */
import { useEffect, useState } from "react";
import { getAccessToken } from "../services/session";
import { readFilePreview } from "../services/read-files";
import type { ReadyFile } from "../types/files";

/**
 * Charge l’aperçu du fichier du compte et rend une image ou un lecteur audio. Annule la lecture et
 * révoque l’URL Blob à la fermeture ou au changement de session.
 */
export default function FilePreview({
  file,
}: {
  /** Métadonnées du fichier privé prêt à être affiché. */
  file: ReadyFile;
}) {
  const [result, setResult] = useState<{
    /** Identité de la requête ou de l’état ; empêche d’afficher une réponse devenue périmée. */
    key: string;
    /** URL Blob locale temporaire, à révoquer après fermeture de l’aperçu. */
    url?: string;
    /** Erreur à rendre visible pour ce résultat ; son absence représente un résultat sans erreur enregistrée. */
    error?: string;
  }>({ key: "" });
  const token = getAccessToken();
  const id = file.id;
  const key = JSON.stringify([token, id]);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void readFilePreview({ id }, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted || token !== getAccessToken()) return;
        url = URL.createObjectURL(blob);
        setResult({ key, url });
      })
      .catch((error) => {
        if (!controller.signal.aborted && token === getAccessToken())
          setResult({
            key,
            error:
              error instanceof Error ? error.message : "Preview unavailable.",
          });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, key, token]);
  if (result.key !== key) return <p role="status">Loading preview…</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  return (
    <audio
      controls
      preload="metadata"
      src={result.url}
      aria-label="Private audio preview"
    />
  );
}
