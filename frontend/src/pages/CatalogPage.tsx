import { useState } from "react";

import AudioPlayer from "../components/AudioPlayer";
import TrackCard from "../components/TrackCard";
import { mockTracks } from "../data/tracks";
import type { Playlist, Track } from "../types/music";

type CatalogPageProps = {
  playlists: Playlist[];
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
};

function CatalogPage({ playlists, onAddTrackToPlaylist }: CatalogPageProps) {
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState(
    playlists[0]?.id ?? "",
  );

  const [searchQuery, setSearchQuery] = useState("");

  const [selectedGenre, setSelectedGenre] = useState("all");

  type SortOption = "title" | "artist" | "duration";

  const [sortOption, setSortOption] = useState<SortOption>("title");

  const [message, setMessage] = useState("");

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredTracks = mockTracks.filter((track) => {
    const matchesSearch =
      normalizedQuery === "" ||
      track.title.toLowerCase().includes(normalizedQuery) ||
      track.artistName.toLowerCase().includes(normalizedQuery) ||
      track.albumTitle.toLowerCase().includes(normalizedQuery) ||
      track.genre.toLowerCase().includes(normalizedQuery);

    const matchesGenre =
      selectedGenre === "all" || track.genre === selectedGenre;

    return matchesSearch && matchesGenre;
  });

  const sortedTracks = [...filteredTracks].sort((firstTrack, secondTrack) => {
    if (sortOption === "artist") {
      return firstTrack.artistName.localeCompare(secondTrack.artistName);
    }

    if (sortOption === "duration") {
      return firstTrack.durationSeconds - secondTrack.durationSeconds;
    }

    return firstTrack.title.localeCompare(secondTrack.title);
  });

  const genres = [...new Set(mockTracks.map((track) => track.genre))];

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
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
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
            {sortedTracks.length} track(s) found
          </p>

          {sortedTracks.length === 0 ? (
            <p className="empty-search-message">No tracks match your search.</p>
          ) : (
            <div className="track-list">
              {sortedTracks.map((track) => (
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
