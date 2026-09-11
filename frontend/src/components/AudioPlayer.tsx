import type { Track } from "../types/music";

type AudioPlayerProps = {
  track: Track;
  onClose: () => void;
};

function AudioPlayer({ track, onClose }: AudioPlayerProps) {
  return (
    <aside className="audio-player" aria-label="Audio player">
      <div className="audio-player-information">
        <strong>{track.title}</strong>

        <span>{track.artistName}</span>
      </div>

      <audio key={track.id} controls autoPlay preload="metadata">
        <source src={track.audioUrl} type={track.mimeType} />
        Your browser does not support audio playback.
      </audio>

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

export default AudioPlayer;
