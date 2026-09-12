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
  const [message, setMessage] = useState("");

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

          <div className="track-list">
            {mockTracks.map((track) => (
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
        </section>
      </main>

      {selectedTrack && (
        <AudioPlayer track={selectedTrack} onClose={handleClosePlayer} />
      )}
    </>
  );
}

export default CatalogPage;
