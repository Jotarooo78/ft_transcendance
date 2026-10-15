/** Sélecteur partagé : choisir une playlist ou en créer une sans perdre la sélection. */
import { useEffect, useRef, useState } from "react";
import type { useLibrary } from "../hooks/useLibrary";
import type { PlaylistSelection } from "../contexts/playlist-actions";
import type { MusicPlaylist } from "../types/music";
import { addPlaylistTracks } from "../services/add-playlist-tracks";
import PlaylistForm from "./PlaylistForm";
/** Le dialogue natif assure le focus clavier ; la fermeture restaure le bouton d'origine. */
export default function PlaylistPicker({
  tracks,
  library,
  onClose,
}: {
  tracks: PlaylistSelection;
  library: ReturnType<typeof useLibrary>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState(""),
    [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  useEffect(() => {
    const origin = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);
  /** Garde le dialogue et ses choix tant que le serveur n'a pas confirmé le lot. */
  async function add(playlist: MusicPlaylist) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (await addPlaylistTracks(library, playlist, tracks)) onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to add tracks.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="playlist-dialog"
      aria-labelledby="playlist-picker-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !formBusy) onClose();
      }}
    >
      <h2 id="playlist-picker-title">
        Add {tracks.length} track(s) to a playlist
      </h2>
      {creating ? (
        <PlaylistForm
          onBusyChange={setFormBusy}
          library={library}
          onCancel={() => setCreating(false)}
          onDone={(playlist) => {
            setCreating(false);
            void add(playlist);
          }}
        />
      ) : (
        <>
          <label>
            Find a playlist
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="playlist-picker-list">
            {library.playlists
              .filter((p) =>
                p.name
                  .toLocaleLowerCase()
                  .includes(query.trim().toLocaleLowerCase()),
              )
              .map((p) => (
                <button key={p.id} disabled={busy} onClick={() => void add(p)}>
                  {p.name}
                  <span>
                    {p.items.length} tracks · {p.visibility}
                  </span>
                </button>
              ))}
          </div>
          <button disabled={busy} onClick={() => setCreating(true)}>
            Create a playlist
          </button>
        </>
      )}
      <button disabled={busy || formBusy} onClick={onClose}>
        Close
      </button>
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}
