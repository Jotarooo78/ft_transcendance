import { useState } from "react";
import type { Track } from "../types/music";

type AudioPlayerProps = {
  track: Track;
  onClose: () => void;
};

function AudioPlayerContent({ track, onClose }: AudioPlayerProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  return (
    <aside className="audio-player" aria-label="Audio player">
      <div className="audio-player-information">
        <strong>{track.title}</strong>

        <span>{track.artistName}</span>
      </div>

      <audio src={track.audioUrl ?? undefined} controls autoPlay preload="metadata"
        onLoadStart={() => setStatus("loading")}
        onCanPlay={() => setStatus("ready")}
        onError={() => setStatus("error")}
      >
        Your browser does not support audio playback.
      </audio>

      {status === "loading" && <p role="status">Loading audio…</p>}
      {status === "error" && <p role="alert">Audio is unavailable. Close the player and try again.</p>}
      {status === "ready" && <p>Use the audio controls to play, pause or seek.</p>}

      <button
        type="button"
        className="close-player-button"
        onClick={onClose}
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
