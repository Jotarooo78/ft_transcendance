/** Panneau de détail chargé indépendamment de la liste Catalogue, avec annulation et nouvelle tentative locale. */
import { useEffect, useRef, useState } from "react";
import ArtistLink from "./ArtistLink";
import TrackArtwork from "./TrackArtwork";
import { useMusicPlayer } from "../contexts/music-player";
import { getTrack } from "../services/catalog";
import type { Track } from "../types/music";

/**
 * Lit le morceau par UUID, place le focus sur le panneau et permet la fermeture par Escape. Une erreur
 * de détail laisse la liste Catalogue utilisable.
 */
export default function TrackDetails({
  id,
  onClose,
}: {
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** Demande la fermeture de l’écran ou du composant concerné. */
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const player = useMusicPlayer();
  const [retry, setRetry] = useState(0);
  const key = `${id}:${retry}`;
  const [result, setResult] = useState<{
    /** Identité de la requête ou de l’état ; empêche d’afficher une réponse devenue périmée. */
    key: string;
    /** Détail public du morceau chargé depuis Catalogue. */
    track?: Track;
    /** Erreur à rendre visible pour ce résultat ; son absence représente un résultat sans erreur enregistrée. */
    error?: string;
  }>({ key: "" });
  useEffect(() => {
    panel.current?.focus();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void getTrack(id, controller.signal)
      .then((track) => {
        if (!controller.signal.aborted) setResult({ key, track });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            error:
              error instanceof Error ? error.message : "Unable to load track.",
          });
      });
    return () => controller.abort();
  }, [id, retry, key]);
  const track = result.key === key ? result.track : undefined;
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="Track details"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <h2>Track details</h2>
      {result.key !== key ? (
        <p role="status">Loading track…</p>
      ) : result.error ? (
        <div role="alert">
          <p>{result.error}</p>
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Retry detail
          </button>
        </div>
      ) : null}
      {track && (
        <>
          <TrackArtwork track={track} />
          <dl>
            <dt>Title</dt>
            <dd>{track.title}</dd>
            <dt>Artists</dt>
            <dd>
              <ArtistLink track={track} />
            </dd>
            <dt>Album</dt>
            <dd>{track.albumTitle || "No album"}</dd>
            <dt>Genre</dt>
            <dd>{track.genre || "Unknown"}</dd>
            <dt>Duration</dt>
            <dd>
              {track.durationSeconds === null
                ? "Unknown"
                : `${track.durationSeconds} seconds`}
            </dd>
          </dl>
          <p className="track-description">{track.description}</p>
          <button type="button" onClick={() => player.play(track)}>
            Listen to {track.title}
          </button>
        </>
      )}
      <button type="button" onClick={onClose}>
        Close details
      </button>
    </section>
  );
}
