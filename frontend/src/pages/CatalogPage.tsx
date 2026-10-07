import { useEffect, useState } from "react";

import AudioPlayer from "../components/AudioPlayer";
import TrackCard from "../components/TrackCard";
import { getTracks, type CatalogList } from "../services/catalog";
import type { Playlist, Track } from "../types/music";

type CatalogPageProps = {
  playlists: Playlist[];
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
};

const TRACKS_PER_PAGE = 2;

function CatalogPage({ playlists, onAddTrackToPlaylist }: CatalogPageProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState(
    playlists[0]?.id ?? "",
  );

  const [searchQuery, setSearchQuery] = useState("");

  const [selectedGenre, setSelectedGenre] = useState("all");

  type SortOption = "title" | "artist" | "duration";

  const [sortOption, setSortOption] = useState<SortOption>("title");

  const [message, setMessage] = useState("");

  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([currentPage, searchQuery, selectedGenre, sortOption, retry]);
  const [result, setResult] = useState<{ key: string; data?: CatalogList; error?: string }>({ key: "" });
  const loading = result.key !== requestKey;
  const data = loading ? undefined : result.data;
  const genres = result.data?.genres ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / TRACKS_PER_PAGE);
  const paginatedTracks = data?.items ?? [];

  useEffect(() => {
    const controller = new AbortController();
    void getTracks({ page: currentPage, pageSize: TRACKS_PER_PAGE, q: searchQuery,
      genre: selectedGenre === "all" ? "" : selectedGenre, sort: sortOption }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key: requestKey, data }); })
      .catch(error => {
        if (!controller.signal.aborted) setResult({ key: requestKey,
          error: error instanceof Error ? error.message : "Unable to load catalogue." });
      });
    return () => controller.abort();
  }, [currentPage, searchQuery, selectedGenre, sortOption, retry, requestKey]);

  function handlePlay(track: Track) {
    setSelectedTrack(track);
  }

  function handleClosePlayer() {
    setSelectedTrack(null);
  }

  function handleAddToPlaylist(track: Track) {
    const playlist = playlists.find(
      (currentPlaylist) => currentPlaylist.id === selectedPlaylistId,
    );

    if (!playlist) {
      setMessage("Create a playlist before adding a track.");
      return;
    }

    if (playlist.trackIds.includes(track.id)) {
      setMessage(`${track.title} is already in ${playlist.name}.`);
      return;
    }

    onAddTrackToPlaylist(playlist.id, track.id);
    setMessage(`${track.title} was added to ${playlist.name}.`);
  }

  return (
    <>
      <main className="catalog-page">
        <header>
          <p className="page-label">Discover</p>

          <h1>Music catalog</h1>

          <p>Explore independent tracks published by our community.</p>
        </header>

        <section
          className="catalog-search"
          aria-labelledby="catalog-search-title"
        >
          <h2 id="catalog-search-title">Search</h2>

          <label htmlFor="track-search">
            Search by title, artist, album or genre
            <input
              id="track-search"
              type="search"
              maxLength={200}
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Example: Aya"
            />
          </label>

          <div className="catalog-filters">
            <label htmlFor="genre-filter">
              Genre
              <select
                id="genre-filter"
                value={selectedGenre}
                onChange={(event) => {
                  setSelectedGenre(event.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All genres</option>

                {genres.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="sort-option">
              Sort by
              <select
                id="sort-option"
                value={sortOption}
                onChange={(event) => {
                  setSortOption(event.target.value as SortOption);
                  setCurrentPage(1);
                }}
              >
                <option value="title">Title</option>
                <option value="artist">Artist</option>
                <option value="duration">Duration</option>
              </select>
            </label>
          </div>
        </section>

        <section className="catalog-section" aria-labelledby="catalog-title">
          <h2 id="catalog-title">Available tracks</h2>

          <div className="playlist-destination">
            <label htmlFor="playlist-destination">
              Add tracks to
              <select
                id="playlist-destination"
                value={selectedPlaylistId}
                onChange={(event) => {
                  setSelectedPlaylistId(event.target.value);
                  setMessage("");
                }}
                disabled={playlists.length === 0}
              >
                {playlists.length === 0 ? (
                  <option value="">No playlist available</option>
                ) : (
                  playlists.map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            {message && (
              <p className="catalog-message" role="status">
                {message}
              </p>
            )}
          </div>

          <p className="search-result-count" aria-live="polite">
            {loading ? "Loading catalogue…" : `${data?.total ?? 0} track(s) found`}
          </p>

          {loading ? <p role="status">Loading tracks…</p> : result.error ? (
            <div role="alert"><p>{result.error}</p><button type="button" onClick={() => setRetry(n => n + 1)}>Retry catalogue</button></div>
          ) : paginatedTracks.length === 0 ? (
            <p className="empty-search-message">No tracks match your search.</p>
          ) : (
            <>
              <div className="track-list">
                {paginatedTracks.map((track) => (
                  <div className="catalog-track" key={track.id}>
                    <TrackCard
                      track={track}
                      isSelected={selectedTrack?.id === track.id}
                      onPlay={handlePlay}
                    />

                    <button
                      type="button"
                      className="track-action-button add-track-button"
                      onClick={() => handleAddToPlaylist(track)}
                      disabled={playlists.length === 0}
                      aria-label={`Add ${track.title} to playlist`}
                      title="Add to playlist"
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <nav className="pagination" aria-label="Catalog pagination">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage((page) => page - 1);
                    }}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>

                  <span aria-live="polite">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage((page) => page + 1);
                    }}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </main>

      {selectedTrack && (
        <AudioPlayer track={selectedTrack} onClose={handleClosePlayer} />
      )}
    </>
  );
}

export default CatalogPage;
