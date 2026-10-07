import { useEffect, useRef, useState } from "react";
import { getTrack } from "../services/catalog";
import type { Track } from "../types/music";

export default function TrackDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const [retry, setRetry] = useState(0);
  const key = `${id}:${retry}`;
  const [result, setResult] = useState<{ key: string; track?: Track; error?: string }>({ key: "" });
  useEffect(() => { panel.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void getTrack(id, controller.signal)
      .then(track => { if (!controller.signal.aborted) setResult({ key, track }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key,
        error: error instanceof Error ? error.message : "Unable to load track." }); });
    return () => controller.abort();
  }, [id, retry, key]);
  const track = result.key === key ? result.track : undefined;
  return <section ref={panel} tabIndex={-1} aria-label="Track details" onKeyDown={e => {
    if (e.key === "Escape") onClose();
  }}>
    <h2>Track details</h2>
    {result.key !== key ? <p role="status">Loading track…</p> : result.error ?
      <div role="alert"><p>{result.error}</p><button type="button" onClick={() => setRetry(n => n + 1)}>Retry detail</button></div> : null}
    {track && <dl>
      <dt>Title</dt><dd>{track.title}</dd>
      <dt>Artists</dt><dd>{track.artistName || "Unknown"}</dd>
      <dt>Album</dt><dd>{track.albumTitle || "No album"}</dd>
      <dt>Genre</dt><dd>{track.genre || "Unknown"}</dd>
      <dt>Duration</dt><dd>{track.durationSeconds === null ? "Unknown" : `${track.durationSeconds} seconds`}</dd>
    </dl>}
    <button type="button" onClick={onClose}>Close details</button>
  </section>;
}
