import { useEffect, useState } from "react";
import { useMusicPlayer } from "../contexts/music-player";
import { useLanguage } from "../hooks/useLanguage";
import { getTrack } from "../services/catalog";
import { translate as t } from "../services/translate";
import type { Track } from "../types/music";
import EmptyArtwork from "./EmptyArtwork";
import PlayerIcon from "./PlayerIcon";
import TrackArtwork from "./TrackArtwork";

/**
 * Morceaux déjà demandés au catalogue, partagés par toutes les bulles : un même morceau partagé
 * plusieurs fois n'est lu qu'une fois. Une lecture échouée est oubliée pour pouvoir réessayer.
 */
const tracks = new Map<string, Promise<Track>>();

/** Lit un morceau dans le catalogue, une seule fois par session. */
function loadTrack(id: string): Promise<Track> {
  let pending = tracks.get(id);
  if (!pending) {
    pending = getTrack(id);
    tracks.set(id, pending);
    pending.catch(() => tracks.delete(id));
  }
  return pending;
}

/**
 * Carte d'un morceau partagé dans un message. Le message ne contient que l'identifiant du morceau
 * (une référence) : titre, artiste et pochette sont relus dans le catalogue. Un morceau retiré depuis
 * le partage s'affiche comme indisponible.
 */
export default function SharedTrack({ trackId }: { trackId: string }) {
  useLanguage();
  const player = useMusicPlayer();
  const [result, setResult] = useState<{
    id: string;
    track?: Track;
    failed?: boolean;
  }>({ id: trackId });

  useEffect(() => {
    let active = true;
    loadTrack(trackId).then(
      (track) => {
        if (active) setResult({ id: trackId, track });
      },
      () => {
        if (active) setResult({ id: trackId, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [trackId]);

  const track = result.id === trackId ? result.track : undefined;
  const failed = result.id === trackId && result.failed;
  const current = !!track && player.currentId === track.id;

  return (
    <div className={failed ? "shared-track unavailable" : "shared-track"}>
      {track ? (
        <TrackArtwork track={track} />
      ) : (
        <EmptyArtwork className="track-artwork track-artwork-placeholder" />
      )}
      <span className="shared-track-text">
        <strong>
          {track?.title ??
            (failed ? t("Track unavailable") : t("Loading track…"))}
        </strong>
        {track && <span>{track.artistName}</span>}
      </span>
      {track && (
        <button
          type="button"
          className="shared-track-play"
          disabled={!track.audioUrl}
          onClick={() => (current ? player.toggle() : player.play(track))}
          aria-label={
            current && player.playing
              ? t("Pause {0}", { "0": track.title })
              : t("Play {0}", { "0": track.title })
          }
        >
          <PlayerIcon name={current && player.playing ? "pause" : "play"} />
        </button>
      )}
    </div>
  );
}
