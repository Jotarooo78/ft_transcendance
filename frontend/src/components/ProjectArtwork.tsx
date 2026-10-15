import EmptyArtwork from "./EmptyArtwork";
/** Pochette commune : URL publique ou lecture privée bornée, avec remplacement visuel en cas d’absence. */
import { useEffect, useState } from "react";
import { readProjectArtwork } from "../services/read-files";
import { getAccessToken } from "../services/session";
/** Une image privée ne place jamais le jeton de connexion dans son adresse. */
export default function ProjectArtwork({
  assetId,
  url,
  personal = false,
}: {
  /** Audio portant l’image privée. */ assetId?: string | null;
  /** Image déjà publique. */ url?: string | null;
  /** Active la lecture authentifiée. */ personal?: boolean;
}) {
  const token = getAccessToken(),
    key = `${personal}:${assetId}:${token}`;
  const [result, setResult] = useState<{ key: string; url: string }>({
    key: "",
    url: "",
  });
  const [failed, setFailed] = useState("");
  useEffect(() => {
    if (!personal || !assetId) return;
    const controller = new AbortController();
    let local = "";
    void readProjectArtwork(assetId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted || token !== getAccessToken()) return;
        local = URL.createObjectURL(blob);
        setResult({ key, url: local });
      })
      .catch(() => {
        /* L’absence de pochette conserve le visuel par défaut. */
      });
    return () => {
      controller.abort();
      if (local) URL.revokeObjectURL(local);
    };
  }, [personal, assetId, key, token]);
  const image = personal ? (result.key === key ? result.url : "") : url;
  return image && failed !== image ? (
    <img
      className="project-artwork"
      src={image}
      alt="Project artwork"
      onError={() => setFailed(image)}
    />
  ) : (
    <EmptyArtwork
      className="project-artwork artwork-placeholder"
      label="Default artwork"
    />
  );
}
