import {
  translate as t,
  translateCount,
  translateError,
} from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import RefreshNotice from "../components/RefreshNotice";
import EmptyArtwork from "../components/EmptyArtwork";
import { useCallback } from "react";
import { useResource } from "../hooks/useResource";
import { getPublicPlaylist } from "../services/library";
import CollectionButton from "../components/CollectionButton";
import PlaylistTracks from "../components/PlaylistTracks";
/** Relit au retour sur l'onglet et périodiquement pour retirer une playlist devenue privée. */
export default function PublicPlaylistPage({ id }: { id: string }) {
  useLanguage();
  const resource = useResource(
    useCallback((signal) => getPublicPlaylist(id, signal), [id]),
  );
  const { reload } = resource;
  const playlist = resource.data;
  return (
    <main className="music-page">
      {playlist ? (
        <>
          <header className="project-hero">
            <EmptyArtwork className="playlist-artwork" />
            <div>
              <p className="page-label">{t("PUBLIC PLAYLIST")}</p>
              <h1>{playlist.name}</h1>
              <p>{playlist.description}</p>
              <p>{translateCount(playlist.items.length, "track")}</p>
            </div>
          </header>
          <CollectionButton kind="playlist" id={id} />
          <PlaylistTracks playlist={playlist} />
        </>
      ) : (
        <>
          <p role={resource.error ? "alert" : "status"}>
            {translateError(resource.error) || t("Loading playlist…")}
          </p>
          {resource.error && (
            <button onClick={reload}>{t("Retry playlist")}</button>
          )}
        </>
      )}
      <RefreshNotice error={resource.refreshError} retry={resource.reload} />
    </main>
  );
}
