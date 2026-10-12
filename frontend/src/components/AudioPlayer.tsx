import { useEffect, useRef, useState } from "react";
import type { Track } from "../types/music";
import { ListeningClock } from "../services/listening-clock";
import { PlaybackQueue, type TrackingStatus } from "../services/playback-queue";
import { closePlayback, openPlayback, savePlaybackProgress } from "../services/playback";
import { getAccessToken } from "../services/session";

type AudioPlayerProps = {
  track: Track;
  onClose: () => void;
};

function AudioPlayerContent({ track, onClose }: AudioPlayerProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tracking, setTracking] = useState<TrackingStatus | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const active = useRef<{ clock: ListeningClock; queue: PlaybackQueue; ended: boolean } | null>(null);
  const createTracker = useRef<(() => void) | null>(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const token = getAccessToken(); let mounted = true;
    const create = () => {
      const clock = new ListeningClock();
      const queue = new PlaybackQueue({ open: () => openPlayback(track.id), progress: savePlaybackProgress, close: closePlayback,
        isCurrent: () => !!token && getAccessToken() === token,
        notify: value => { if (mounted && active.current?.queue === queue) setTracking(value); } });
      active.current = { clock, queue, ended: false };
    };
    createTracker.current = create; create();
    const tick = () => {
      const current = active.current;
      if (!current || current.ended) return;
      const snapshot = current.clock.sample({ nowMs: performance.now(), positionMs: Math.max(0, audio.currentTime * 1000),
        playing: !audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 3, discontinuity: audio.seeking });
      current.queue.offer(snapshot);
    };
    const interval = window.setInterval(tick, 1000);
    const finish = () => {
      const current = active.current;
      if (!current) return;
      const snapshot = current.clock.sample({ nowMs: performance.now(), positionMs: Math.max(0, audio.currentTime * 1000), playing: false, discontinuity: audio.seeking });
      current.ended = true; current.queue.detach(snapshot);
    };
    window.addEventListener("pagehide", finish);
    return () => { mounted = false; window.clearInterval(interval); window.removeEventListener("pagehide", finish); finish(); active.current = null; createTracker.current = null; };
  }, [track.id]);
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
        onEnded={() => observe(false, false, false, true)}
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

export default function AudioPlayer(props: AudioPlayerProps) {
  return <AudioPlayerContent key={props.track.id} {...props} />;
}
