import { useState, type SubmitEvent } from "react";
import type { PrivatePlaylist } from "../types/music";
import PlaylistTracks from "../components/PlaylistTracks";

type Props = {
  playlists: PrivatePlaylist[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onCreate: (name: string, description: string) => Promise<PrivatePlaylist>;
  onRemoveItem: (playlist: PrivatePlaylist, itemId: string) => Promise<PrivatePlaylist>;
};

export default function PlaylistsPage({ playlists, loading, error, onRetry, onCreate, onRemoveItem }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const selected = playlists.find(playlist => playlist.id === selectedId) ?? playlists[0];
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || name.trim() === "") return;
    setCreating(true); setCreateError("");
    try {
      const playlist = await onCreate(name.trim(), description.trim());
      setSelectedId(playlist.id); setName(""); setDescription("");
    } catch (error) { setCreateError(error instanceof Error ? error.message : "Unable to create playlist."); }
    finally { setCreating(false); }
  }
  return <main className="playlists-page">
    <header><p className="page-label">Your library</p><h1>Playlists</h1><p>Your private playlists.</p></header>
    <section className="playlist-section" aria-labelledby="create-playlist-title">
      <h2 id="create-playlist-title">Create a playlist</h2>
      <form className="playlist-form" onSubmit={handleSubmit}>
        <label>Name<input type="text" value={name} onChange={event => setName(event.target.value)} required disabled={creating} /></label>
        <label>Description<input type="text" value={description} onChange={event => setDescription(event.target.value)} disabled={creating} /></label>
        <button type="submit" disabled={creating || loading || !!error || name.trim() === ""}>{creating ? "Creating…" : "Create playlist"}</button>
        {createError && <p role="alert">{createError}</p>}
      </form>
    </section>
    <section className="playlist-section" aria-labelledby="my-playlists-title">
      <h2 id="my-playlists-title">My playlists</h2>
      <button type="button" onClick={onRetry} disabled={loading}>Refresh playlists</button>
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
      <PlaylistTracks key={selected.id} playlist={selected} onRemove={onRemoveItem} />
    </section>}
  </main>;
}
