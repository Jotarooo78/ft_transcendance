import { useEffect, useState } from "react";
import AudioPlayer from "../components/AudioPlayer";
import { getTrack } from "../services/catalog";
import { getPlaybackHistory, type PlaybackHistory, type PlaybackSession } from "../services/playback";
import { getAccessToken } from "../services/session";
import type { Track } from "../types/music";

function HistoryItem({ session, onPlay }: { session: PlaybackSession; onPlay: (track: Track) => void }) {
  const [detail, setDetail] = useState<{ track?: Track; error?: string }>({});
  useEffect(() => {
    const controller = new AbortController();
    void getTrack(session.trackId, controller.signal).then(track => {
      if (!controller.signal.aborted) setDetail({ track });
    }).catch(() => { if (!controller.signal.aborted) setDetail({ error: "Track unavailable" }); });
    return () => controller.abort();
  }, [session.trackId]);
  return <li data-session-id={session.id}>
    <h2>{detail.track?.title ?? detail.error ?? "Loading track details…"}</h2>
    <p><time dateTime={session.startedAt}>{new Date(session.startedAt).toLocaleString()}</time></p>
    <dl>
      <dt>Time listened</dt><dd data-field="listened" data-ms={session.listenedMs}>{(session.listenedMs / 1000).toFixed(1)} s</dd>
      <dt>Last position</dt><dd data-field="position" data-ms={session.positionMs}>{(session.positionMs / 1000).toFixed(1)} s</dd>
      <dt>Track duration</dt><dd>{(session.trackDurationMs / 1000).toFixed(1)} s</dd>
      <dt>Session</dt><dd>{session.endedAt ? "Closed" : "Open"}</dd>
    </dl>
    <button type="button" disabled={!detail.track?.audioUrl} onClick={() => { if (detail.track) onPlay(detail.track); }}>Play track</button>
  </li>;
}

export default function HistoryPage() {
  const [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const token = getAccessToken(), key = JSON.stringify([token, page, retry]);
  const [result, setResult] = useState<{ key: string; data?: PlaybackHistory; error?: string }>({ key: "" });
  useEffect(() => {
    const controller = new AbortController();
    void getPlaybackHistory(page, controller.signal).then(data => {
      if (!controller.signal.aborted && token === getAccessToken()) setResult({ key, data });
    }).catch(error => {
      if (!controller.signal.aborted && token === getAccessToken()) setResult({ key, error: error instanceof Error ? error.message : "Unable to load history." });
    });
    return () => controller.abort();
  }, [key, page, token]);
  const loading = result.key !== key, data = loading ? undefined : result.data;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  return <>
    <main className="playlists-page">
      <header><p className="page-label">Your listening</p><h1>History</h1><p>Listening progress saved to your account.</p></header>
      <button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)}>Refresh history</button>
      {loading ? <p role="status">Loading listening history…</p> : result.error ?
        <div role="alert"><p>{result.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry history</button></div> : <>
          {data?.items.length === 0 && <p>No listening sessions on this page.</p>}
          <ol className="history-list">{data?.items.map(session => <HistoryItem key={session.id} session={session} onPlay={setSelectedTrack} />)}</ol>
          <nav className="pagination" aria-label="History pagination">
            <button type="button" disabled={page === 1} onClick={() => { setSelectedTrack(null); setPage(value => value - 1); }}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => { setSelectedTrack(null); setPage(value => value + 1); }}>Next</button>
          </nav>
        </>}
    </main>
    {selectedTrack && <AudioPlayer key={selectedTrack.id} track={selectedTrack} onClose={() => setSelectedTrack(null)} />}
  </>;
}
