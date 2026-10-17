import {
  translate as t,
  translateCount,
  translateState,
  translateError,
  formatNumber,
} from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
/** Collections complètes : la recherche et le tri précèdent toujours la pagination. */
import { useCallback, useState } from "react";
import { useCollections } from "../contexts/collections";
import { useLibraryView } from "../contexts/library-view";
import type { useLibrary } from "../hooks/useLibrary";
import { useResource } from "../hooks/useResource";
import { getPublicPlaylist } from "../services/library";
import { RequestError } from "../services/request-json";
import { openMusic } from "../services/music-navigation";
import type { MusicPlaylist } from "../types/music";
import PlaylistArtwork from "./PlaylistArtwork";
import PlaylistForm from "./PlaylistForm";
import CollectionButton from "./CollectionButton";
import RefreshNotice from "./RefreshNotice";
/** Conserve les références devenues privées sous une carte neutre encore retirable. */
export default function PlaylistCollection({
  owned,
  library,
}: {
  owned: boolean;
  library: ReturnType<typeof useLibrary>;
}) {
  useLanguage();
  const collections = useCollections();
  const ids = JSON.stringify(
    owned ? [] : (collections?.data?.playlist.map((p) => p.id) ?? []),
  );
  const saved = useResource(
    useCallback(
      async (signal) => {
        const selected: string[] = JSON.parse(ids);
        const result: {
          id: string;
          playlist: MusicPlaylist | null;
          error?: string;
        }[] = new Array(selected.length);
        let cursor = 0;
        // Six lectures simultanées au maximum, même dans une grande bibliothèque.
        await Promise.all(
          Array.from({ length: Math.min(6, selected.length) }, async () => {
            while (cursor < selected.length && !signal.aborted) {
              const index = cursor++,
                id = selected[index];
              try {
                result[index] = {
                  id,
                  playlist: await getPublicPlaylist(id, signal),
                };
              } catch (reason) {
                result[index] = {
                  id,
                  playlist: null,
                  error:
                    reason instanceof RequestError &&
                    [403, 404].includes(reason.status)
                      ? undefined
                      : "Temporarily unavailable",
                };
              }
            }
          }),
        );
        return result;
      },
      [ids],
    ),
    !owned,
    "saved-playlists",
  );
  const loading = owned
    ? library.loading
    : saved.loading || collections?.loading;
  const [view, setView] = useLibraryView(
    owned ? "owned" : "playlist",
    !loading,
  );
  const [creating, setCreating] = useState(false);
  const items = (
    owned
      ? library.playlists.map((playlist) => ({
          id: playlist.id,
          playlist,
          error: undefined,
        }))
      : (saved.data ?? [])
  )
    .filter(
      (item) =>
        !view.query.trim() ||
        item.playlist?.name
          .toLocaleLowerCase()
          .includes(view.query.trim().toLocaleLowerCase()),
    )
    .sort((a, b) =>
      view.sort === "name"
        ? (a.playlist?.name ?? "").localeCompare(b.playlist?.name ?? "")
        : (
            (view.sort === "created"
              ? b.playlist?.createdAt
              : b.playlist?.updatedAt) ?? ""
          ).localeCompare(
            (view.sort === "created"
              ? a.playlist?.createdAt
              : a.playlist?.updatedAt) ?? "",
          ) || a.id.localeCompare(b.id),
    );
  const pages = Math.max(1, Math.ceil(items.length / 24)),
    page = Math.min(view.page, pages);
  return (
    <section className="playlist-collection">
      <div className="music-section-heading">
        <h2>{owned ? t("My playlists") : t("Saved playlists")}</h2>
        {owned && (
          <button onClick={() => setCreating(true)}>
            {t("Create a playlist")}
          </button>
        )}
      </div>
      {creating && (
        <PlaylistForm
          library={library}
          onCancel={() => setCreating(false)}
          onDone={(p) => openMusic("library", `owned/${p.id}`)}
        />
      )}
      <div className="playlist-toolbar">
        <label>
          {" "}
          {t("Search playlists")}{" "}
          <input
            value={view.query}
            onChange={(e) =>
              setView((v) => ({ ...v, query: e.target.value, page: 1 }))
            }
          />
        </label>
        <label>
          {" "}
          {t("Sort playlists")}{" "}
          <select
            aria-label={t("Sort playlists")}
            value={view.sort}
            onChange={(e) =>
              setView((v) => ({ ...v, sort: e.target.value, page: 1 }))
            }
          >
            <option value="updated">{t("Recently modified")}</option>
            <option value="created">{t("Recently created")}</option>
            <option value="name">{t("Name")}</option>
          </select>
        </label>
      </div>
      <RefreshNotice
        retained={!!items.length}
        error={
          owned
            ? (library.error ?? library.refreshError)
            : (saved.error ?? saved.refreshError ?? collections?.error)
        }
        retry={owned ? library.reload : saved.reload}
      />
      {loading ? (
        <p role="status">{t("Loading playlists…")}</p>
      ) : !items.length ? (
        <p>
          {view.query
            ? t("No playlists match this search.")
            : owned
              ? t("Create your first playlist to collect music you love.")
              : t("Save a public playlist to find it here.")}
        </p>
      ) : (
        <div className="music-grid playlist-grid">
          {items
            .slice((page - 1) * 24, page * 24)
            .map(({ id, playlist, error }) => (
              <div key={id} data-scroll-anchor={id}>
                {playlist ? (
                  <button
                    className="music-card playlist-card"
                    onClick={() =>
                      openMusic(
                        "library",
                        `${owned ? "owned" : "playlist"}/${id}`,
                      )
                    }
                  >
                    <PlaylistArtwork playlist={playlist} owned={owned} />
                    <strong>{playlist.name}</strong>
                    <span>
                      {translateCount(playlist.items.length, "track")} ·{" "}
                      {translateState(playlist.visibility)}
                    </span>
                  </button>
                ) : (
                  <p>
                    <span>
                      {translateError(error) || t("Playlist unavailable")}
                    </span>
                    {error && (
                      <button onClick={saved.reload}>{t("Retry")}</button>
                    )}
                  </p>
                )}
                {!owned && <CollectionButton kind="playlist" id={id} />}
              </div>
            ))}
        </div>
      )}
      <nav className="music-pagination" aria-label={t("Playlist pages")}>
        <button
          disabled={page === 1}
          onClick={() => setView((v) => ({ ...v, page: page - 1 }))}
        >
          {" "}
          {t("Previous")}{" "}
        </button>
        <span>
          {t("Page {page} of {pages}", {
            page: formatNumber(page),
            pages: formatNumber(pages),
          })}
        </span>
        <button
          disabled={page === pages}
          onClick={() => setView((v) => ({ ...v, page: page + 1 }))}
        >
          {" "}
          {t("Next")}{" "}
        </button>
      </nav>
    </section>
  );
}
