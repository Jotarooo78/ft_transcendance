import { useState } from "react";
import { useTrackDetails } from "../hooks/useTrackDetails";
import type { MusicPlaylist } from "../types/music";
import MusicTrackRow from "./MusicTrackRow";
import { useMusicPlayer } from "../contexts/music-player";
/** Conserve les occurrences et leur ordre ; le retrait n'est disponible qu'au propriétaire. */
export default function PlaylistTracks({
  playlist,
  onRemove,
}: {
  playlist: MusicPlaylist;
  onRemove?: (
    playlist: MusicPlaylist,
    itemId: string,
  ) => Promise<MusicPlaylist>;
}) {
  const player = useMusicPlayer();
  const details = useTrackDetails(playlist.items.map((item) => item.trackId));
  const [removing, setRemoving] = useState(false),
    [error, setError] = useState("");
  const available = playlist.items.flatMap((item) => {
    const track = details.data?.[item.trackId];
    return track ? [{ item, track }] : [];
  });
  const queue = available.map(({ track }) => track),
    ids = available.map(({ item }) => item.id);
  /** Retire l'occurrence seulement après confirmation ; une panne reste visible. */
  async function remove(itemId: string) {
    if (removing || !onRemove) return;
    setRemoving(true);
    setError("");
    try {
      await onRemove(playlist, itemId);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to remove track.",
      );
    } finally {
      setRemoving(false);
    }
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {!playlist.items.length && (
        <p>This playlist does not contain any tracks yet.</p>
      )}
      {!!queue.length && (
        <div className="music-section-heading">
          <button
            onClick={() =>
              player.play(queue[0], queue, {
                ids,
                index: 0,
                source: playlist.name,
                restart: true,
              })
            }
          >
            Play playlist
          </button>
          <button
            onClick={() => {
              const index = Math.floor(Math.random() * queue.length);
              player.play(queue[index], queue, {
                ids,
                index,
                source: playlist.name,
                shuffle: true,
                restart: true,
              });
            }}
          >
            Shuffle play
          </button>
        </div>
      )}
      <ol className="music-occurrences">
        {playlist.items.map((item, index) => {
          const track = details.data?.[item.trackId];
          const action = onRemove && (
            <button disabled={removing} onClick={() => void remove(item.id)}>
              Remove track
            </button>
          );
          return (
            <li key={item.id} data-item-id={item.id}>
              {track ? (
                <MusicTrackRow
                  track={track}
                  queue={queue}
                  queueIds={ids}
                  queueIndex={ids.indexOf(item.id)}
                  source={playlist.name}
                  number={index + 1}
                  extra={action}
                />
              ) : (
                <div className="music-unavailable">
                  {details.loading ? "Loading track…" : "Track unavailable"}
                  {action}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!details.loading && queue.length < playlist.items.length && (
        <button onClick={details.reload}>Retry track details</button>
      )}
    </>
  );
}
