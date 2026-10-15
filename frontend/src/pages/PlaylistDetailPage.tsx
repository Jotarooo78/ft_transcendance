/** Page dédiée de bibliothèque, propriétaire ou playlist publique enregistrée. */
import { useCallback, useEffect, useState } from "react";
import type { useLibrary } from "../hooks/useLibrary";
import { useResource } from "../hooks/useResource";
import { useTrackDetails } from "../hooks/useTrackDetails";
import { getPlaylist, getPublicPlaylist } from "../services/library";
import { getArtist } from "../services/artists";
import { openMusic } from "../services/music-navigation";
import { addPlaylistTracks } from "../services/add-playlist-tracks";
import type { PlaylistSelection } from "../contexts/playlist-actions";
import type { MusicPlaylist } from "../types/music";
import PlaylistArtwork from "../components/PlaylistArtwork";
import PlaylistTracks from "../components/PlaylistTracks";
import PlaylistForm from "../components/PlaylistForm";
import PlaylistTrackSearch from "../components/PlaylistTrackSearch";
import CollectionButton from "../components/CollectionButton";
import RefreshNotice from "../components/RefreshNotice";
/** Les lectures sont suspendues durant les modifications ; les conflits demandent une revue explicite. */
export default function PlaylistDetailPage({
  id,
  owned,
  library,
}: {
  id: string;
  owned: boolean;
  library: ReturnType<typeof useLibrary>;
}) {
  const resource = useResource(
    useCallback(
      (signal) =>
        owned ? getPlaylist(id, signal) : getPublicPlaylist(id, signal),
      [id, owned],
    ),
  );
  const confirmed = library.playlists.find((p) => p.id === id);
  const playlist =
    resource.data &&
    owned &&
    confirmed &&
    confirmed.version > resource.data.version
      ? confirmed
      : resource.data;
  const details = useTrackDetails(
    playlist?.items.map((item) => item.trackId) ?? [],
  );
  const creatorId = playlist?.ownerUserId;
  const creator = useResource(
    useCallback(
      async (signal) => (creatorId ? getArtist(creatorId, signal) : null),
      [creatorId],
    ),
  );
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [undo, setUndo] = useState<{ id: string; expires: number } | null>(
    null,
  );
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(
      () => setUndo(null),
      Math.max(0, undo.expires - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [undo]);
  /** Sérialise les actions de l'écran sans masquer une erreur de transport. */
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    const resume = resource.pause();
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to update playlist.",
      );
    } finally {
      resume();
      setBusy(false);
    }
  }
  /** Confirme les doublons en un seul lot ; conserve la sélection si l'ajout est refusé. */
  async function add(tracks: PlaylistSelection) {
    let added = false;
    if (playlist)
      await run(async () => {
        const result = await addPlaylistTracks(library, playlist, tracks);
        if (result) {
          resource.update(() => result.playlist);
          added = true;
        }
      });
    return added;
  }
  /** Rend la confirmation au composant de lignes pour terminer son retrait optimiste. */
  async function remove(base: MusicPlaylist, itemId: string) {
    const resume = resource.pause();
    try {
      const result = await library.perform(base, { kind: "remove", itemId });
      resource.update(() => result.playlist);
      setUndo({ id: result.operationId, expires: Date.now() + 5000 });
      return result.playlist;
    } finally {
      resume();
    }
  }
  if (!playlist)
    return (
      <section className="music-page">
        <button
          onClick={() => openMusic("library", owned ? "owned" : "playlist")}
        >
          Back to library
        </button>
        <p role={resource.error ? "alert" : "status"}>
          {resource.error ?? "Loading playlist…"}
        </p>
        {resource.error && (
          <button onClick={resource.reload}>Retry playlist</button>
        )}
      </section>
    );
  const duration = playlist.items.reduce(
    (sum, item) => sum + (details.data?.[item.trackId]?.durationSeconds ?? 0),
    0,
  );
  const missingDuration = playlist.items.some(
    (item) => !details.data?.[item.trackId]?.durationSeconds,
  );
  return (
    <section className="playlist-detail">
      <button
        className="playlist-back"
        onClick={() => openMusic("library", owned ? "owned" : "playlist")}
      >
        ← Back to library
      </button>
      <header className="project-hero playlist-hero">
        <PlaylistArtwork
          playlist={playlist}
          owned={owned}
          tracks={details.data ?? {}}
        />
        <div>
          <p className="page-label">
            {playlist.visibility.toUpperCase()} PLAYLIST
          </p>
          <h1>{playlist.name}</h1>
          <p>{playlist.description}</p>
          <p>
            {creator.data?.displayName ?? "Artist"} · {playlist.items.length}{" "}
            tracks · {Math.floor(duration / 60)}:
            {String(Math.floor(duration % 60)).padStart(2, "0")}
            {missingDuration ? " (known duration)" : ""}
          </p>
        </div>
      </header>
      <div className="playlist-toolbar">
        {owned ? (
          <>
            <button
              disabled={busy}
              onClick={() => setEditing((value) => !value)}
            >
              Edit playlist
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete playlist "${playlist.name}"?`))
                  void run(async () => {
                    await library.remove(playlist);
                    openMusic("library", "owned");
                  });
              }}
            >
              Delete playlist
            </button>
          </>
        ) : (
          <CollectionButton kind="playlist" id={id} />
        )}
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const copy = await library.duplicate(playlist);
              openMusic("library", `owned/${copy.id}`);
            })
          }
        >
          Duplicate playlist
        </button>
      </div>
      {editing && (
        <PlaylistForm
          playlist={playlist}
          library={library}
          onCancel={() => setEditing(false)}
          onDone={(saved) => {
            resource.update(() => saved);
            setEditing(false);
          }}
        />
      )}
      {error && <p role="alert">{error}</p>}
      <RefreshNotice error={resource.refreshError} retry={resource.reload} />
      <PlaylistTracks
        playlist={playlist}
        trackDetails={details}
        onRemove={owned && !busy ? remove : undefined}
        onReorder={
          owned && !busy
            ? async (itemIds) => {
                const resume = resource.pause();
                try {
                  const result = await library.perform(playlist, {
                    kind: "reorder",
                    itemIds,
                  });
                  resource.update(() => result.playlist);
                } finally {
                  resume();
                }
              }
            : undefined
        }
      />
      {undo && (
        <div className="playlist-undo" role="status">
          Track removed.
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await library.perform(playlist, {
                  kind: "restore",
                  removalId: undo.id,
                });
                resource.update(() => result.playlist);
                setUndo(null);
              })
            }
          >
            Undo
          </button>
        </div>
      )}
      {owned && <PlaylistTrackSearch onAdd={add} busy={busy} />}
    </section>
  );
}
