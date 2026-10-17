import { translate as t } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import EmptyArtwork from "./EmptyArtwork";
/** Image privée de l’audio, chargée avec un Blob borné et remplacée sans conserver l’ancienne image d’un autre compte. */
import { useEffect, useState } from "react";
import { getAccessToken } from "../services/session";
import { readAudioCover } from "../services/read-files";
import type { ReadyFile } from "../types/files";

/** Affiche la pochette confirmée ou un visuel par défaut ; révoque les URL locales après remplacement ou démontage. */
export default function AudioCover({
  file,
}: {
  /** Audio privé et métadonnées de sa pochette facultative. */ file: ReadyFile;
}) {
  useLanguage();
  const [failedUrl, setFailedUrl] = useState("");
  const token = getAccessToken(),
    coverId = file.cover?.id,
    key = JSON.stringify([token, file.id, coverId]);
  const [result, setResult] = useState<{
    /** Identité de la demande courante. */ key: string;
    /** URL temporaire du Blob. */ url?: string;
    /** Refus de lecture. */ error?: string;
  }>({ key: "" });
  useEffect(() => {
    if (!file.cover) return;
    const controller = new AbortController();
    let url: string | undefined;
    void readAudioCover(file, controller.signal)
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
              error instanceof Error ? error.message : "Cover unavailable.",
          });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, key, token]);
  if (!coverId)
    return (
      <EmptyArtwork className="audio-cover-placeholder" label={t("No cover")} />
    );
  if (
    result.key !== key ||
    result.error ||
    !result.url ||
    failedUrl === result.url
  )
    return (
      <EmptyArtwork
        className="audio-cover-placeholder"
        label={t("Cover unavailable")}
      />
    );
  return (
    <img
      className="audio-cover"
      src={result.url}
      alt={t("Audio cover")}
      onError={() => setFailedUrl(result.url!)}
    />
  );
}
