import { translate as t } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import EmptyArtwork from "./EmptyArtwork";
/** Pochette publique d’un morceau ; une absence d’image affiche un visuel par défaut. */
import { useState } from "react";
import type { Track } from "../types/music";

/** Garde les erreurs d’image locales sans empêcher l’écoute du morceau. */
export default function TrackArtwork({
  track,
}: {
  /** Morceau et route publique de sa pochette. */ track: Track;
}) {
  useLanguage();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return track.coverUrl && failedUrl !== track.coverUrl ? (
    <img
      className="track-artwork"
      src={track.coverUrl}
      alt={t("Artwork for {0}", { "0": track.title })}
      onError={() => setFailedUrl(track.coverUrl!)}
    />
  ) : (
    <EmptyArtwork className="track-artwork track-artwork-placeholder" />
  );
}
