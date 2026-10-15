import RefreshNotice from "../components/RefreshNotice";
import { useCallback, useEffect } from "react";
import { useLibraryView } from "../contexts/library-view";
import { useResource } from "../hooks/useResource";
import { readTrackDetails } from "../services/track-details";
import { getPlaybackHistory } from "../services/playback";
import MusicTrackRow from "../components/MusicTrackRow";
/** Historique chronologique : chaque écoute reste une ligne, même pour un titre répété. */
export default function HistoryPage() {
  const [view, setView] = useLibraryView("history");
  const page = view.page;
  /** Conserve la page de l'historique lors d'une visite d'une autre section. */
  const setPage = (change: (page: number) => number) =>
    setView((v) => ({ ...v, page: change(v.page) }));
  const history = useResource(
    useCallback(
      async (signal) => {
        const data = await getPlaybackHistory(page, signal);
        const tracks = await readTrackDetails(
          data.items.map((item) => item.trackId),
          signal,
          true,
        );
        return { ...data, tracks };
      },
      [page],
    ),
  );
  const { reload } = history;
  useEffect(() => {
    window.addEventListener("music-history-changed", reload);
    return () => window.removeEventListener("music-history-changed", reload);
  }, [reload]);
  const pages = Math.max(1, Math.ceil((history.data?.total ?? 0) / 20));
  return (
    <section className="history-page">
      <header>
        <p className="page-label">YOUR LISTENING</p>
        <h1>Recently played</h1>
        <p>Every listen, from newest to oldest.</p>
      </header>
      {history.loading ? (
        <p role="status">Loading listening history…</p>
      ) : history.error ? (
        <p role="alert">
          {history.error}
          <button onClick={history.reload}>Retry history</button>
        </p>
      ) : (
        <>
          {!history.data?.items.length && (
            <p>No listening sessions on this page.</p>
          )}
          <ol className="music-occurrences">
            {history.data?.items.map((session) => {
              const track = history.data?.tracks[session.trackId];
              const date = (
                <time dateTime={session.startedAt}>
                  {new Date(session.startedAt).toLocaleString()}
                </time>
              );
              return (
                <li
                  key={session.id}
                  data-session-id={session.id}
                  data-scroll-anchor={session.id}
                >
                  {track ? (
                    <MusicTrackRow
                      track={track}
                      source="History"
                      extra={date}
                    />
                  ) : (
                    <div className="music-unavailable">
                      <span>Track unavailable</span>
                      {date}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {history.data &&
            Object.values(history.data.tracks).some((track) => !track) && (
              <button onClick={history.reload}>Retry track details</button>
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
      <RefreshNotice error={history.refreshError} retry={history.reload} />
    </section>
  );
}
