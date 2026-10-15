/** Vue non modale de la file ; les modifications ne touchent jamais la playlist source. */
import { useEffect, useRef } from "react";
import { useMusicPlayer } from "../contexts/music-player";
import { upcoming } from "../services/music-queue";
import TrackArtwork from "./TrackArtwork";
import PlayerIcon from "./PlayerIcon";
/** Place le focus à l’ouverture puis le rend au contrôle d’origine à la fermeture. */
export default function QueuePanel() {
  const player = useMusicPlayer(),
    panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const origin = document.activeElement;
    panel.current?.focus();
    return () => {
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);
  const next = upcoming(player.queue);
  return (
    <aside
      id="music-queue"
      className="queue-panel"
      aria-label="Playback queue"
      tabIndex={-1}
      ref={panel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          player.showQueue(false);
        }
      }}
    >
      <header>
        <div>
          <p className="page-label">UP NEXT</p>
          <h2>Your queue</h2>
        </div>
        <button
          className="player-icon-button"
          aria-label="Close queue"
          title="Close queue"
          onClick={() => player.showQueue(false)}
        >
          <PlayerIcon name="close" />
        </button>
      </header>
      <p className="queue-source">{player.queue.source}</p>
      {player.current && (
        <>
          <h3>Now playing</h3>
          <div className="queue-current">
            <TrackArtwork track={player.current.track} />
            <div>
              <strong>{player.current.track.title}</strong>
              <span>{player.current.track.artistName}</span>
            </div>
            <span className="queue-current-state">
              {player.playing ? "Playing" : "Paused"}
            </span>
          </div>
        </>
      )}
      <h3>
        Next up <span>{next.length}</span>
      </h3>
      {!next.length && (
        <p className="queue-empty">
          {player.queue.repeat === "all"
            ? "The queue will start again."
            : player.queue.repeat === "one"
              ? "This track will repeat."
              : "You’re at the end of the queue."}
        </p>
      )}
      <ol>
        {next.map((entry) => (
          <li key={entry.key} data-queue-entry={entry.key}>
            <button
              className="queue-track"
              onClick={() => player.jump(entry.key)}
              aria-label={`Play queued ${entry.track.title}`}
            >
              <TrackArtwork track={entry.track} />
              <span>
                <strong>{entry.track.title}</strong>
                <small>{entry.track.artistName}</small>
              </span>
            </button>
            <button
              className="player-icon-button"
              onClick={() => player.remove(entry.key)}
              aria-label={`Remove queued ${entry.track.title}`}
              title="Remove from queue"
            >
              <PlayerIcon name="close" />
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
