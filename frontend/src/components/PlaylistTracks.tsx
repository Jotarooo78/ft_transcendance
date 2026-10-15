import { useState } from "react";
import { useTrackDetails } from "../hooks/useTrackDetails";
import type { MusicPlaylist, Track } from "../types/music";
import MusicTrackRow from "./MusicTrackRow";
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
  const details = useTrackDetails(playlist.items.map((item) => item.trackId));
  const [removing, setRemoving] = useState(false),
    [error, setError] = useState("");
  const queue = playlist.items
    .map((item) => details.data?.[item.trackId])
    .filter((track): track is Track => !!track);
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
                  queue={playlist.items
                    .slice(index)
                    .map((next) => details.data?.[next.trackId])
                    .filter((value): value is Track => !!value)}
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
