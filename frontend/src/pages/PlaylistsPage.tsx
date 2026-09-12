import { useState, type SubmitEvent } from "react";

import AudioPlayer from "../components/AudioPlayer";
import TrackCard from "../components/TrackCard";
import { mockPlaylists } from "../data/playlists";
import { mockTracks } from "../data/tracks";
import type { Playlist, Track } from "../types/music";

function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>(mockPlaylists);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    mockPlaylists[0]?.id ?? null,
  );

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  const selectedPlaylist =
    playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null;

  /*
   * Retrouve les objets Track dont les identifiants sont présents
   * dans la playlist sélectionnée.
   */
  const playlistTracks = selectedPlaylist
    ? mockTracks.filter((track) => selectedPlaylist.trackIds.includes(track.id))
    : [];

  /*
   * Ajoute ou retire un morceau de la sélection du formulaire.
   */
  function handleTrackSelection(trackId: string) {
    setSelectedTrackIds((currentIds) =>
      currentIds.includes(trackId)
        ? currentIds.filter((id) => id !== trackId)
        : [...currentIds, trackId],
    );
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();

    if (trimmedName === "" || selectedTrackIds.length === 0) {
      return;
    }

    const newPlaylist: Playlist = {
      id: crypto.randomUUID(),
      name: trimmedName,
      description: description.trim(),
      trackIds: selectedTrackIds,
    };

    setPlaylists((currentPlaylists) => [...currentPlaylists, newPlaylist]);

    setSelectedPlaylistId(newPlaylist.id);

    setName("");
    setDescription("");
    setSelectedTrackIds([]);
  }

  return (
    <>
      <main className="playlists-page">
        <header>
          <p className="page-label">Your library</p>

          <h1>Playlists</h1>

          <p>Create a temporary playlist from the mock catalog.</p>
        </header>

        <section
          className="playlist-section"
          aria-labelledby="create-playlist-title"
        >
          <h2 id="create-playlist-title">Create a playlist</h2>

          <form className="playlist-form" onSubmit={handleSubmit}>
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                required
              />
            </label>

            <label>
              Description
              <input
                type="text"
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
              />
            </label>

            <fieldset>
              <legend>Tracks</legend>

              {mockTracks.map((track) => (
                <label className="track-choice" key={track.id}>
                  <input
                    type="checkbox"
                    checked={selectedTrackIds.includes(track.id)}
                    onChange={() => {
                      handleTrackSelection(track.id);
                    }}
                  />
                  {track.title} — {track.artistName}
                </label>
              ))}
            </fieldset>

            <button
              type="submit"
              disabled={name.trim() === "" || selectedTrackIds.length === 0}
            >
              Create playlist
            </button>
          </form>
        </section>

        <section
          className="playlist-section"
          aria-labelledby="my-playlists-title"
        >
          <h2 id="my-playlists-title">My playlists</h2>

          <div className="playlist-list">
            {playlists.map((playlist) => (
              <button
                type="button"
                className={
                  playlist.id === selectedPlaylistId
                    ? "playlist-card active"
                    : "playlist-card"
                }
                key={playlist.id}
                onClick={() => {
                  setSelectedPlaylistId(playlist.id);
                }}
              >
                <strong>{playlist.name}</strong>

                <span>{playlist.description || "No description"}</span>

                <span>{playlist.trackIds.length} track(s)</span>
              </button>
            ))}
          </div>
        </section>

        {selectedPlaylist && (
          <section
            className="playlist-section"
            aria-labelledby="playlist-tracks-title"
          >
            <h2 id="playlist-tracks-title">
              Tracks in {selectedPlaylist.name}
            </h2>

            <div className="track-list">
              {playlistTracks.map((track) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  isSelected={selectedTrack?.id === track.id}
                  onPlay={setSelectedTrack}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {selectedTrack && (
        <AudioPlayer
          track={selectedTrack}
          onClose={() => {
            setSelectedTrack(null);
          }}
        />
      )}
    </>
  );
}

export default PlaylistsPage;
