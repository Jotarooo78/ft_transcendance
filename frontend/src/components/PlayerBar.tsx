import { translate as t, translateError } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import { usePlaybackProgress } from "../contexts/playback-progress";
/** Barre persistante : mêmes commandes pour tous les points d’entrée musicaux. */
import { useEffect, useRef, type ReactNode } from "react";
import { useMusicPlayer } from "../contexts/music-player";
import TrackArtwork from "./TrackArtwork";
import ArtistLink from "./ArtistLink";
import PlayerIcon from "./PlayerIcon";
import QueuePanel from "./QueuePanel";
import "../styles/music-player.css";
/** Formate des secondes finies sans afficher NaN pendant le chargement. */
function time(seconds: number) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
/** Présente l’état du moteur ; le chargement reste dans le bouton sans déplacer la page. */
export default function PlayerBar({
  children,
}: {
  /** Moteur audio et éventuelle erreur de suivi. */ children: ReactNode;
}) {
  useLanguage();
  const progress = usePlaybackProgress();
  const player = useMusicPlayer(),
    latest = useRef(player),
    bar = useRef<HTMLElement>(null);
  useEffect(() => {
    latest.current = player;
  });
  useEffect(() => {
    /** Évite de détourner les touches d’un formulaire, menu, bouton ou dialogue. */
    function keydown(event: KeyboardEvent) {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (
        document.querySelector("dialog[open]") ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, button, a, summary, [contenteditable], [role="button"], [role="slider"]',
          ))
      )
        return;
      event.preventDefault();
      latest.current.toggle();
    }
    window.addEventListener("keydown", keydown);
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty(
        "--player-height",
        `${bar.current?.getBoundingClientRect().height ?? 0}px`,
      ),
    );
    if (bar.current) observer.observe(bar.current);
    document.body.classList.add("has-music-player");
    return () => {
      window.removeEventListener("keydown", keydown);
      observer.disconnect();
      document.body.classList.remove("has-music-player");
      document.documentElement.style.removeProperty("--player-height");
    };
  }, []);
  if (!player.current) return null;
  const repeatLabel =
    player.queue.repeat === "off"
      ? "Repeat off"
      : player.queue.repeat === "all"
        ? "Repeat queue"
        : "Repeat one";
  return (
    <>
      {player.queueOpen && <QueuePanel />}
      <aside
        ref={bar}
        className="audio-player music-player-bar"
        aria-label={t("Audio player")}
      >
        <div className="player-now">
          <TrackArtwork track={player.current.track} />
          <div>
            <strong title={player.current.track.title}>
              {player.current.track.title}
            </strong>
            <span>
              <ArtistLink track={player.current.track} />
            </span>
          </div>
        </div>
        <div className="player-center">
          <div className="player-controls">
            <button
              className="player-icon-button player-mode"
              aria-label={t("Shuffle")}
              aria-pressed={player.queue.shuffle}
              title={player.queue.shuffle ? t("Shuffle on") : t("Shuffle off")}
              onClick={player.shuffle}
            >
              <PlayerIcon name="shuffle" />
            </button>
            <button
              className="player-icon-button"
              aria-label={t("Previous track")}
              title={t("Previous track")}
              onClick={player.previous}
            >
              <PlayerIcon name="previous" />
            </button>
            <button
              className={`player-icon-button player-main-toggle${player.loading ? " is-loading" : ""}`}
              aria-busy={player.loading}
              aria-label={player.playing ? t("Pause") : t("Play")}
              title={player.playing ? t("Pause") : t("Play")}
              onClick={player.toggle}
            >
              <PlayerIcon name={player.playing ? "pause" : "play"} />
              {player.loading && (
                <span
                  key={player.current.key}
                  className="player-loading-ring"
                  aria-hidden="true"
                />
              )}
            </button>
            <button
              className="player-icon-button"
              aria-label={t("Next track")}
              title={t("Next track")}
              onClick={player.next}
            >
              <PlayerIcon name="next" />
            </button>
            <button
              className="player-icon-button player-mode"
              aria-label={t(repeatLabel)}
              aria-pressed={player.queue.repeat !== "off"}
              title={t(repeatLabel)}
              onClick={player.repeat}
            >
              <PlayerIcon name="repeat" />
              {player.queue.repeat === "one" && (
                <span className="repeat-one">1</span>
              )}
            </button>
          </div>
          <div className="player-timeline">
            <span>{time(progress.position)}</span>
            <input
              aria-label={t("Playback position")}
              type="range"
              min="0"
              max={progress.duration || 0}
              step="0.1"
              value={Math.min(progress.position, progress.duration || 0)}
              disabled={!progress.duration}
              onChange={(event) => player.seek(Number(event.target.value))}
              aria-valuetext={t("{0} of {1}", {
                "0": time(progress.position),
                "1": time(progress.duration),
              })}
            />
            <span>{time(progress.duration)}</span>
          </div>
        </div>
        <div className="player-tools">
          <button
            className="player-icon-button"
            aria-label={player.muted ? t("Unmute") : t("Mute")}
            title={player.muted ? t("Unmute") : t("Mute")}
            onClick={player.toggleMute}
          >
            <PlayerIcon
              name={player.muted || player.volume === 0 ? "muted" : "volume"}
            />
          </button>
          <input
            aria-label={t("Volume")}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={player.muted ? 0 : player.volume}
            onChange={(event) => player.setVolume(Number(event.target.value))}
            aria-valuetext={`${Math.round((player.muted ? 0 : player.volume) * 100)}%`}
          />
          <button
            className="player-icon-button"
            aria-label={t("Queue")}
            title={t("Queue")}
            aria-expanded={player.queueOpen}
            aria-controls="music-queue"
            onClick={() => player.showQueue(!player.queueOpen)}
          >
            <PlayerIcon name="queue" />
          </button>
          <button
            className="player-icon-button player-close"
            aria-label={t("Close audio player")}
            title={t("Stop and clear queue")}
            onClick={player.close}
          >
            <PlayerIcon name="close" />
          </button>
        </div>
        <div className="player-engine">{children}</div>
        <span className="visually-hidden" role="status">
          {player.loading ? t("Loading audio…") : ""}
        </span>
        {player.notice && (
          <div className="player-notice" role="status">
            <span>{translateError(player.notice)}</span>
            {!player.loading &&
              /retry|resume|playable/i.test(player.notice) && (
                <button onClick={player.retry}>{t("Retry playback")}</button>
              )}
          </div>
        )}
      </aside>
    </>
  );
}
