import CollectionButton from "./CollectionButton";
/** Ligne de morceau commune au catalogue, aux projets, à la bibliothèque et à l’historique. */
import type { ReactNode } from "react";
import type { Track } from "../types/music";
import TrackArtwork from "./TrackArtwork";
import PlayerIcon from "./PlayerIcon";
import TrackQueueActions from "./TrackQueueActions";
import { openMusic } from "../services/music-navigation";
import ArtistLink from "./ArtistLink";
import { useMusicPlayer } from "../contexts/music-player";
/** Le supplément contient la date d’écoute ou les actions propres à l’écran. */
export default function MusicTrackRow({
  track,
  queue,
  number,
  extra,
  queueIds,
  queueIndex,
  source,
}: {
  /** Morceau confirmé. */ track: Track;
  /** Ordre de lecture facultatif. */ queue?: Track[];
  /** Identités des places de la liste complète. */ queueIds?: string[];
  /** Place choisie, distincte de l’identité du morceau. */ queueIndex?: number;
  /** Origine de la sélection affichée dans la file. */ source?: string;
  /** Rang affiché dans un projet. */ number?: number;
  /** Informations et actions du contexte. */ extra?: ReactNode;
}) {
  const player = useMusicPlayer();
  const occurrence = queueIds?.[queueIndex ?? 0] ?? track.id;
  const active =
    player.currentId === track.id && player.currentOccurrence === occurrence;
  /** Un clic sur la surface de la ligne reprend le titre courant sans le recommencer. */
  function play() {
    player.play(track, queue, { ids: queueIds, index: queueIndex, source });
  }
  const seconds = Math.floor(track.durationSeconds ?? 0);
  return (
    <div
      className={`music-track-row${active ? " is-current" : ""}${active && player.playing ? " is-playing" : ""}`}
      tabIndex={track.audioUrl ? 0 : undefined}
      role="group"
      aria-label={`${track.title}${active ? (player.playing ? ", playing" : ", paused") : ""}`}
      aria-current={active ? "true" : undefined}
      onClick={(event) => {
        if (
          !track.audioUrl ||
          window.getSelection()?.toString() ||
          (event.target instanceof Element &&
            event.target.closest(
              "button, a, input, select, textarea, summary, details, [contenteditable], [role=button]",
            ))
        )
          return;
        play();
      }}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          track.audioUrl &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          play();
        }
      }}
    >
      <button
        className="track-play"
        aria-label={`${active && player.playing ? "Pause" : "Play"} ${track.title}`}
        disabled={!track.audioUrl}
        onClick={() => (active ? player.toggle() : play())}
      >
        {active && player.playing ? (
          <>
            <span className="track-equalizer" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="track-hover-control">
              <PlayerIcon name="pause" />
            </span>
          </>
        ) : active ? (
          <PlayerIcon name="play" />
        ) : (
          <>
            <span className="track-rank">
              {number ?? <PlayerIcon name="play" />}
            </span>
            <span className="track-hover-control">
              <PlayerIcon name="play" />
            </span>
          </>
        )}
      </button>
      <TrackArtwork track={track} />
      <div className="track-label">
        <strong>{track.title}</strong>
        <span>
          <ArtistLink track={track} />
        </span>
      </div>
      <span className="track-album">
        {track.projectId ? (
          <button
            className="artist-link"
            onClick={() => openMusic("projects", track.projectId!)}
          >
            {track.albumTitle}
          </button>
        ) : (
          track.albumTitle
        )}
      </span>
      <span className="track-duration">
        {track.durationSeconds === null
          ? "—"
          : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
      </span>
      <CollectionButton kind="track" id={track.id} />
      <TrackQueueActions track={track} />
      {extra && <div className="track-row-actions">{extra}</div>}
    </div>
  );
}
