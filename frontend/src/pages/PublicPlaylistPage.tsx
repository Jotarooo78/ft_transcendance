import EmptyArtwork from "../components/EmptyArtwork";
import { useCallback, useEffect } from "react";
import { useResource } from "../hooks/useResource";
import { getPublicPlaylist } from "../services/library";
import CollectionButton from "../components/CollectionButton";
import PlaylistTracks from "../components/PlaylistTracks";
/** Relit au retour sur l'onglet et périodiquement pour retirer une playlist devenue privée. */
export default function PublicPlaylistPage({ id }: { id: string }) {
  const resource = useResource(
    useCallback((signal) => getPublicPlaylist(id, signal), [id]),
  );
  const { reload } = resource;
  useEffect(() => {
    const refresh = () => reload();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [reload]);
  const playlist = resource.data;
  return (
    <main className="music-page">
      {playlist ? (
        <>
          <header className="project-hero">
            <EmptyArtwork className="playlist-artwork" />
            <div>
              <p className="page-label">PUBLIC PLAYLIST</p>
              <h1>{playlist.name}</h1>
              <p>{playlist.description}</p>
              <p>{playlist.items.length} tracks</p>
            </div>
          </header>
          <CollectionButton kind="playlist" id={id} />
          <PlaylistTracks playlist={playlist} />
        </>
      ) : (
        <>
          <p role={resource.error ? "alert" : "status"}>
            {resource.error ?? "Loading playlist…"}
          </p>
          {resource.error && <button onClick={reload}>Retry playlist</button>}
        </>
      )}
    </main>
  );
}
