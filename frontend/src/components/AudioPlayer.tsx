import { useEffect, useRef, useState } from "react";
import type { Track } from "../types/music";
import { ListeningClock } from "../services/listening-clock";
import { PlaybackQueue, type TrackingStatus } from "../services/playback-queue";
import { closePlayback, openPlayback, savePlaybackProgress } from "../services/playback";
import { getAccessToken } from "../services/session";

type AudioPlayerProps = {
  track: Track;
  onClose: () => void;
  /** Passe au morceau suivant après la clôture de la session courante. */
  onEnded?: () => void;
};

/**
 * Relie le lecteur audio réel à la mesure d’écoute et à la file de sauvegarde du compte. Les
 * événements pause, attente et déplacement interrompent le crédit ; un échec de suivi ne bloque pas
 * l’audio.
 */
function AudioPlayerContent({ track, onClose, onEnded }: AudioPlayerProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tracking, setTracking] = useState<TrackingStatus | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const active = useRef<{
    /** Horloge mesurant le temps de lecture effective, distincte de la position. */
    clock: ListeningClock;
    /** File sérialisant les confirmations de progression et de clôture. */
    queue: PlaybackQueue;
    /** Indique que ce cycle de suivi du lecteur a déjà atteint sa fin. */
    ended: boolean } | null>(null);
  const createTracker = useRef<(() => void) | null>(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const token = getAccessToken(); let mounted = true;
    /**
     * Crée une nouvelle horloge et une file pour ce morceau, avec garde de session avant les envois et les
     * notifications.
     */
    const create = () => {
      const clock = new ListeningClock();
      const queue = new PlaybackQueue({
        /** Ouvre le suivi du morceau courant dans Playback, au moment de la lecture réelle. */
        open: () => openPlayback(track.id), progress: savePlaybackProgress, close: closePlayback,
        /** Vérifie que le token reste celui du compte ayant commencé cette écoute. */
        isCurrent: () => !!token && getAccessToken() === token,
        /** Met à jour l’état visible de sauvegarde uniquement pour le compte courant. */
        notify: value => { if (mounted && active.current?.queue === queue) setTracking(value); } });
      active.current = { clock, queue, ended: false };
    };
    createTracker.current = create; create();
    /** Échantillonne périodiquement la position du vrai lecteur et propose la mesure à la file de suivi. */
    const tick = () => {
      const current = active.current;
      if (!current || current.ended) return;
      const snapshot = current.clock.sample({ nowMs: performance.now(), positionMs: Math.max(0, audio.currentTime * 1000),
        playing: !audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 3, discontinuity: audio.seeking });
      current.queue.offer(snapshot);
    };
    const interval = window.setInterval(tick, 1000);
    /** Échantillonne la dernière position et détache le suivi lors du nettoyage, puis retire le timer. */
    const finish = () => {
      const current = active.current;
      if (!current) return;
      const snapshot = current.clock.sample({ nowMs: performance.now(), positionMs: Math.max(0, audio.currentTime * 1000), playing: false, discontinuity: audio.seeking });
      current.ended = true; current.queue.detach(snapshot);
    };
    window.addEventListener("pagehide", finish);
    return () => { mounted = false; window.clearInterval(interval); window.removeEventListener("pagehide", finish); finish(); active.current = null; createTracker.current = null; };
  }, [track.id]);
  /**
   * Échantillonne l’événement du lecteur, distingue rupture de position et lecture active, démarre le
   * suivi à la première lecture et le ferme à la fin.
   */
  function observe(playing: boolean, discontinuity = false, start = false, end = false) {
    const audio = audioRef.current;
    if (!audio) return;
    if (start && active.current?.ended) createTracker.current?.();
    const current = active.current;
    if (!current || (current.ended && !start)) return;
    const snapshot = current.clock.sample({ nowMs: performance.now(), positionMs: Math.max(0, audio.currentTime * 1000), playing, discontinuity });
    if (start) void current.queue.start(snapshot);
    else if (end) { current.ended = true; void current.queue.finish(snapshot); }
    else current.queue.offer(snapshot);
  }
  return (
    <aside className="audio-player" aria-label="Audio player">
      <div className="audio-player-information">
        <strong>{track.title}</strong>

        <span>{track.artistName}</span>
      </div>

      <audio ref={audioRef} src={track.audioUrl ?? undefined} controls autoPlay preload="metadata"
        onLoadStart={() => setStatus("loading")}
        onCanPlay={() => setStatus("ready")}
        onError={() => { setStatus("error"); observe(false, false, false, true); }}
        onPlaying={() => observe(true, false, true)}
        onPause={() => observe(false)}
        onWaiting={() => observe(false)}
        onSeeking={() => observe(false, true)}
        onSeeked={() => observe(!!audioRef.current && !audioRef.current.paused && audioRef.current.readyState >= 3, true)}
        onEnded={() => { observe(false, false, false, true); onEnded?.(); }}
      >
        Your browser does not support audio playback.
      </audio>

      {status === "loading" && <p role="status">Loading audio…</p>}
      {status === "error" && <p role="alert">Audio is unavailable. Close the player and try again.</p>}
      {status === "ready" && <p>Use the audio controls to play, pause or seek.</p>}
      {tracking && <div className="listening-status" role={tracking.state === "error" ? "alert" : "status"}>
        <p>{tracking.message}</p>
        {tracking.canRetry && <button type="button" onClick={() => active.current?.queue.retry()}>Retry saving</button>}
      </div>}

      <button
        type="button"
        className="close-player-button"
        onClick={() => { observe(false, false, false, true); onClose(); }}
        aria-label="Close audio player"
      >
        Close
      </button>
    </aside>
  );
}

/** Remonte le contenu avec une clé par morceau afin de séparer ses observations et son cycle de suivi. */
export default function AudioPlayer(props: AudioPlayerProps) {
  return <AudioPlayerContent key={props.track.id} {...props} />;
}
