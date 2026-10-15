/** Recherche Catalogue dédiée à l'ajout ; la sélection conserve l'ordre des clics entre les pages. */
import { useCallback, useEffect, useState } from "react";
import { useResource } from "../hooks/useResource";
import { getTracks } from "../services/catalog";
import type { PlaylistSelection } from "../contexts/playlist-actions";
import MusicTrackRow from "./MusicTrackRow";
/** Regroupe les choix en une mutation ; seule une confirmation vide la sélection. */
export default function PlaylistTrackSearch({
  onAdd,
  busy,
}: {
  onAdd: (tracks: PlaylistSelection) => Promise<boolean>;
  busy: boolean;
}) {
  const [input, setInput] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PlaylistSelection>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(input);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [input]);
  const resource = useResource(
    useCallback(
      (signal) =>
        getTracks(
          { q: query, page, pageSize: 20, sort: "recent", genre: "" },
          signal,
        ),
      [query, page],
    ),
  );
  return (
    <section className="playlist-search" aria-label="Add tracks">
      <h2>Find more music</h2>
      <div className="playlist-toolbar">
        <label>
          Search tracks to add
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search by title or artist"
          />
        </label>
        <button
          disabled={busy || !selected.length}
          onClick={() => {
            void onAdd(selected).then((added) => {
              if (added) setSelected([]);
            });
          }}
        >
          Add {selected.length} selected
        </button>
        {!!selected.length && (
          <button disabled={busy} onClick={() => setSelected([])}>
            Clear selection
          </button>
        )}
      </div>
      {resource.error && (
        <p role="alert">
          {resource.error}
          <button onClick={resource.reload}>Retry</button>
        </p>
      )}
      {resource.data?.items.map((track) => (
        <div className="playlist-select-row" key={track.id}>
          <input
            type="checkbox"
            aria-label={`Select ${track.title}`}
            disabled={
              busy ||
              (!selected.some((t) => t.id === track.id) &&
                selected.length >= 500)
            }
            checked={selected.some((t) => t.id === track.id)}
            onChange={(event) =>
              setSelected((items) =>
                event.target.checked
                  ? [...items, track]
                  : items.filter((t) => t.id !== track.id),
              )
            }
          />
          <MusicTrackRow track={track} source="Playlist search" />
        </div>
      ))}
      {resource.data?.total === 0 && <p>No matching tracks.</p>}
      <nav className="music-pagination" aria-label="Track search pages">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>Page {page}</span>
        <button
          disabled={page * 20 >= (resource.data?.total ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </nav>
    </section>
  );
}
