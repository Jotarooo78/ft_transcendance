import { useState, type SubmitEvent } from "react";

import AudioPlayer from "../components/AudioPlayer";
import TrackCard from "../components/TrackCard";
import { mockTracks } from "../data/tracks";
import type { Playlist, Track } from "../types/music";

type PlaylistsPageProps = {
  playlists: Playlist[];
  onCreatePlaylist: (playlist: Playlist) => void;
  onRemoveTrack: (playlistId: string, trackId: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onUpdatePlaylist: (
    playlistId: string,
    name: string,
    description: string,
  ) => void;
};

function PlaylistsPage({
  playlists,
  onCreatePlaylist,
  onRemoveTrack,
  onDeletePlaylist,
  onUpdatePlaylist,
}: PlaylistsPageProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    playlists[0]?.id ?? null,
  );

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const selectedPlaylist =
    playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null;

  /*
   * Finds the Track objects whose identifiers are present
   * in the selected playlist.
   */
  const playlistTracks = selectedPlaylist
    ? mockTracks.filter((track) => selectedPlaylist.trackIds.includes(track.id))
    : [];

  /*
   * Adds or removes a track from the form selection.
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

    onCreatePlaylist(newPlaylist);

    setSelectedPlaylistId(newPlaylist.id);

    setName("");
    setDescription("");
    setSelectedTrackIds([]);
  }

  function handleRemoveTrack(track: Track) {
    if (!selectedPlaylist) {
      return;
    }

    onRemoveTrack(selectedPlaylist.id, track.id);

    if (selectedTrack?.id === track.id) {
      setSelectedTrack(null);
    }
  }

  function handleDeletePlaylist() {
    if (!selectedPlaylist) {
      return;
    }

    const shouldDelete = window.confirm(
      `Delete the playlist "${selectedPlaylist.name}"?`,
    );

    if (!shouldDelete) {
      return;
    }

    const nextPlaylist = playlists.find(
      (playlist) => playlist.id !== selectedPlaylist.id,
    );

    onDeletePlaylist(selectedPlaylist.id);
    setSelectedPlaylistId(nextPlaylist?.id ?? null);
    setSelectedTrack(null);
    setIsEditing(false);
  }

  function handleStartEditing() {
    if (!selectedPlaylist) {
      return;
    }

    setEditName(selectedPlaylist.name);
    setEditDescription(selectedPlaylist.description);
    setIsEditing(true);
  }

  function handleUpdateSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPlaylist) {
      return;
    }

    const trimmedName = editName.trim();

    if (trimmedName === "") {
      return;
    }

    onUpdatePlaylist(selectedPlaylist.id, trimmedName, editDescription.trim());
    setIsEditing(false);
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
                  setIsEditing(false);
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
            <div className="playlist-heading">
              <h2 id="playlist-tracks-title">
                Tracks in {selectedPlaylist.name}
              </h2>

              <div className="playlist-heading-actions">
                <button
                  type="button"
                  className="edit-playlist-button"
                  onClick={handleStartEditing}
                >
                  Edit playlist
                </button>

                <button
                  type="button"
                  className="delete-playlist-button"
                  onClick={handleDeletePlaylist}
                >
                  Delete playlist
                </button>
              </div>
            </div>

            {isEditing && (
              <form
                className="edit-playlist-form"
                onSubmit={handleUpdateSubmit}
              >
                <label>
                  Name
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    required
                  />
                </label>

                <label>
                  Description
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                  />
                </label>

                <div className="edit-playlist-actions">
                  <button
                    type="button"
                    className="cancel-edit-button"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </button>

                  <button type="submit" disabled={editName.trim() === ""}>
                    Save changes
                  </button>
                </div>
              </form>
            )}

            {playlistTracks.length === 0 ? (
              <p className="empty-playlist-message">
                This playlist does not contain any tracks yet.
              </p>
            ) : (
              <div className="track-list">
                {playlistTracks.map((track) => (
                  <div className="playlist-track" key={track.id}>
                    <TrackCard
                      track={track}
                      isSelected={selectedTrack?.id === track.id}
                      onPlay={setSelectedTrack}
                    />

                    <button
                      type="button"
                      className="track-action-button remove-track-button"
                      onClick={() => handleRemoveTrack(track)}
                      aria-label={`Remove ${track.title} from playlist`}
                      title="Remove from playlist"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
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
