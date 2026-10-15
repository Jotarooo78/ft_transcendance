import { useCallback, useState } from "react";
import { useResource } from "../hooks/useResource";
import { useTrackDetails } from "../hooks/useTrackDetails";
import { getPlaybackHistory } from "../services/playback";
import MusicTrackRow from "../components/MusicTrackRow";
/** Historique chronologique : chaque écoute reste une ligne, même pour un titre répété. */
export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const history = useResource(
    useCallback((signal) => getPlaybackHistory(page, signal), [page]),
  );
  const details = useTrackDetails(
    history.data?.items.map((item) => item.trackId) ?? [],
  );
  const pages = Math.max(1, Math.ceil((history.data?.total ?? 0) / 20));
  return (
    <main className="music-page history-page">
      <header>
        <p className="page-label">YOUR LISTENING</p>
        <h1>Recently played</h1>
        <p>Every listen, from newest to oldest.</p>
      </header>
      <button disabled={history.loading} onClick={history.reload}>
        Refresh history
      </button>
      {history.loading ? (
        <p role="status">Loading listening history…</p>
      ) : history.error ? (
        <p role="alert">{history.error}</p>
      ) : (
        <>
          {!history.data?.items.length && (
            <p>No listening sessions on this page.</p>
          )}
          <ol className="music-occurrences">
            {history.data?.items.map((session) => {
              const track = details.data?.[session.trackId];
              const date = (
                <time dateTime={session.startedAt}>
                  {new Date(session.startedAt).toLocaleString()}
                </time>
              );
              return (
                <li key={session.id} data-session-id={session.id}>
                  {track ? (
                    <MusicTrackRow
                      track={track}
                      source="History"
                      extra={date}
                    />
                  ) : (
                    <div className="music-unavailable">
                      <span>
                        {details.loading
                          ? "Loading track…"
                          : "Track unavailable"}
                      </span>
                      {date}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {details.data &&
            Object.values(details.data).some((track) => !track) && (
              <button onClick={details.reload}>Retry track details</button>
            )}
          <nav className="music-pagination" aria-label="History pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </main>
  );
}
