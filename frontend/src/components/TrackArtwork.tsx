/** Pochette publique d’un morceau ; une absence d’image affiche un visuel par défaut. */
import { useState } from "react";
import type { Track } from "../types/music";

/** Garde les erreurs d’image locales sans empêcher l’écoute du morceau. */
export default function TrackArtwork({ track }: { /** Morceau et route publique de sa pochette. */ track: Track }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return track.coverUrl && failedUrl !== track.coverUrl ? <img className="track-artwork" src={track.coverUrl} alt={`Artwork for ${track.title}`} onError={() => setFailedUrl(track.coverUrl!)} /> : <div className="track-artwork track-artwork-placeholder" aria-label="No artwork">♪</div>;
}
