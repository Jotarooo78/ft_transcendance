import { useEffect, useState } from "react";
import { getTrack } from "../services/catalog";
import type { PrivatePlaylist, Track } from "../types/music";
import AudioPlayer from "./AudioPlayer";

type Props = { playlist: PrivatePlaylist; onRemove: (playlist: PrivatePlaylist, itemId: string) => Promise<PrivatePlaylist> };

export default function PlaylistTracks({ playlist, onRemove }: Props) {
  const [retry, setRetry] = useState(0);
  const ids = JSON.stringify([...new Set(playlist.items.map(item => item.trackId))].sort());
  const key = JSON.stringify([ids, retry]);
  const [result, setResult] = useState<{ key: string; tracks: Record<string, Track>; errors: Record<string, string> }>({ key: "", tracks: {}, errors: {} });
  const [playingItem, setPlayingItem] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const trackIds: string[] = JSON.parse(ids);
    const tracks: Record<string, Track> = {}, errors: Record<string, string> = {};
    void Promise.all(trackIds.map(async id => {
      try { tracks[id] = await getTrack(id, controller.signal); }
      catch (error) { errors[id] = error instanceof Error ? error.message : "Unable to load track."; }
    })).then(() => { if (!controller.signal.aborted) setResult({ key, tracks, errors }); });
    return () => controller.abort();
  }, [ids, key]);
  const ready = result.key === key;
  const playing = playlist.items.find(item => item.id === playingItem);
  const playingTrack = ready && playing ? result.tracks[playing.trackId] : undefined;
  async function remove(itemId: string) {
    if (removing) return;
    setRemoving(true); setError("");
    try { await onRemove(playlist, itemId); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to remove track."); }
    finally { setRemoving(false); }
  }
  return <>
    {error && <p role="alert">{error}</p>}
    {playlist.items.length === 0 ? <p>This playlist does not contain any tracks yet.</p> : <ol>
      {playlist.items.map(item => {
        const track = ready ? result.tracks[item.trackId] : undefined;
        return <li key={item.id} data-item-id={item.id}>
          {track ? <><strong>{track.title}</strong><span> — {track.artistName}</span>
            <button type="button" disabled={!track.audioUrl} onClick={() => setPlayingItem(item.id)}>Play {track.title}</button></> :
            <span>{ready ? result.errors[item.trackId] ?? "Track unavailable." : "Loading track…"}</span>}
          <button type="button" disabled={removing} onClick={() => { void remove(item.id); }}>Remove track</button>
        </li>;
      })}
    </ol>}
    {ready && Object.keys(result.errors).length > 0 && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry track details</button>}
    {playingTrack && <AudioPlayer key={playingItem} track={playingTrack} onClose={() => setPlayingItem(null)} />}
  </>;
}
