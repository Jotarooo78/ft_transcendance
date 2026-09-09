import type {
  Track,
} from "../types/music";

type TrackCardProps = {
  track: Track;
};

function formatDuration(
  durationSeconds: number,
): string {
  const minutes = Math.floor(
    durationSeconds / 60,
  );

  const seconds = durationSeconds % 60;

  return `${minutes}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function TrackCard({
  track,
}: TrackCardProps) {
  return (
    <article className="track-card">
      <header>
        <p className="track-genre">
          {track.genre}
        </p>

        <h2>{track.title}</h2>
      </header>

      <dl className="track-information">
        <div>
          <dt>Artist</dt>
          <dd>{track.artistName}</dd>
        </div>

        <div>
          <dt>Album</dt>
          <dd>{track.albumTitle}</dd>
        </div>

        <div>
          <dt>Duration</dt>
          <dd>
            {formatDuration(
              track.durationSeconds,
            )}
          </dd>
        </div>
      </dl>

      <button type="button">
        Play
      </button>
    </article>
  );
}

export default TrackCard;