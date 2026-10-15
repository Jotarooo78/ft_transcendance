import { translate as t } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import ArtistLink from "./ArtistLink";
import TrackArtwork from "./TrackArtwork";
import type { Track } from "../types/music";

type TrackCardProps = {
  track: Track;
  isSelected: boolean;
  onPlay: (track: Track) => void;
};

/**
 * Affiche minutes et secondes à partir d’une durée en secondes ; conserve une indication inconnue
 * lorsque la durée manque.
 */
function formatDuration(durationSeconds: number | null): string {
  if (durationSeconds === null) return t("Unknown");
  const minutes = Math.floor(durationSeconds / 60);

  const seconds = Math.floor(durationSeconds % 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Présente le morceau publié, son visuel et le compte artiste consultable. */
function TrackCard({ track, isSelected, onPlay }: TrackCardProps) {
  useLanguage();
  return (
    <article className="track-card" data-track-id={track.id}>
      <TrackArtwork track={track} />
      <header>
        <p className="track-genre">{track.genre}</p>

        <h2>{track.title}</h2>
      </header>

      <dl className="track-information">
        <div>
          <dt>{t("Artist")}</dt>
          <dd>
            <ArtistLink track={track} />
          </dd>
        </div>

        <div>
          <dt>{t("Album")}</dt>
          <dd>{track.albumTitle}</dd>
        </div>

        <div>
          <dt>{t("Duration")}</dt>
          <dd>{formatDuration(track.durationSeconds)}</dd>
        </div>
      </dl>

      <button
        type="button"
        aria-pressed={isSelected}
        disabled={!track.audioUrl}
        onClick={() => {
          onPlay(track);
        }}
      >
        {isSelected ? t("Selected") : t("Play")}
      </button>
    </article>
  );
}

export default TrackCard;
