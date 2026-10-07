import { useState } from "react";
import type { PrivatePlaylist } from "../types/music";

type Props = {
  playlists: PrivatePlaylist[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
};

export default function PlaylistsPage({ playlists, loading, error, onRetry }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = playlists.find(playlist => playlist.id === selectedId) ?? playlists[0];
  return <main className="playlists-page">
    <header><p className="page-label">Your library</p><h1>Playlists</h1><p>Your private playlists.</p></header>
    <section className="playlist-section" aria-labelledby="create-playlist-title">
      <h2 id="create-playlist-title">Create a playlist</h2>
      <fieldset disabled>
        <label>Name<input type="text" /></label>
        <label>Description<input type="text" /></label>
        <button type="button">Create playlist</button>
      </fieldset>
    </section>
    <section className="playlist-section" aria-labelledby="my-playlists-title">
      <h2 id="my-playlists-title">My playlists</h2>
      {loading ? <p role="status">Loading playlists…</p> : error ?
        <div role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Retry playlists</button></div> : <>
          {playlists.length === 0 && <p>No playlists yet.</p>}
          <div className="playlist-list">{playlists.map(playlist => <button type="button" key={playlist.id}
            className={playlist.id === selected?.id ? "playlist-card active" : "playlist-card"}
            onClick={() => setSelectedId(playlist.id)}>
            <strong>{playlist.name}</strong><span>{playlist.description || "No description"}</span>
            <span>{playlist.items.length} track(s)</span>
          </button>)}</div>
        </>}
    </section>
    {!loading && !error && selected && <section className="playlist-section" aria-labelledby="playlist-tracks-title">
      <div className="playlist-heading"><h2 id="playlist-tracks-title">Tracks in {selected.name}</h2>
        <div className="playlist-heading-actions"><button type="button" disabled>Edit playlist</button><button type="button" disabled>Delete playlist</button></div>
      </div>
      {selected.items.length === 0 ? <p>This playlist does not contain any tracks yet.</p> :
        <ol>{selected.items.map(item => <li key={item.id}>Saved track <button type="button" disabled>Remove track</button></li>)}</ol>}
    </section>}
  </main>;
}
