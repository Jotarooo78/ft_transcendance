import {
  translate as t,
  translateError,
  translateCount,
  formatNumber,
} from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import { RequestError } from "../services/request-json";
import RefreshNotice from "../components/RefreshNotice";
import { useCallback, useState } from "react";
import { useCollections } from "../contexts/collections";
import { useResource } from "../hooks/useResource";
import type { useLibrary } from "../hooks/useLibrary";
import { readTrackDetails } from "../services/track-details";
import { getTrack } from "../services/catalog";
import { getProject, getProjects } from "../services/projects";
import { getArtist } from "../services/artists";
import { openMusic } from "../services/music-navigation";
import type { CollectionKind } from "../types/collections";
import MusicTrackRow from "../components/MusicTrackRow";
import ProjectCard from "../components/ProjectCard";
import ArtistCard from "../components/ArtistCard";
import CollectionButton from "../components/CollectionButton";
import PlaylistCollection from "../components/PlaylistCollection";
import PlaylistDetailPage from "./PlaylistDetailPage";
import PlaylistPicker from "../components/PlaylistPicker";
import HistoryPage from "./HistoryPage";
import {
  PlaylistActionsContext,
  usePlaylistActions,
  type PlaylistSelection,
} from "../contexts/playlist-actions";
import { useLibraryView } from "../contexts/library-view";
/** Références dont l'affichage n'est pas pris en charge par PlaylistCollection. */
type SavedKind = Exclude<CollectionKind, "playlist">;
/** Relit les détails publics : une référence ne garde jamais le contenu d'une playlist devenue privée. */
async function loadReference(kind: SavedKind, id: string, signal: AbortSignal) {
  if (kind === "track")
    return { kind, value: await getTrack(id, signal) } as const;
  if (kind === "project")
    return { kind, value: await getProject(id, false, signal) } as const;
  return { kind, value: await getArtist(id, signal) } as const;
}
/** Liste une section avec ses indisponibilités et son retrait toujours possible. */
function SavedSection({ kind }: { kind: SavedKind }) {
  useLanguage();
  const collection = useCollections()!;
  const [view, setView] = useLibraryView(kind, !collection.loading);
  const page = view.page;
  /** Change la page en conservant les autres préférences de cette section. */
  const setPage = (change: (page: number) => number) =>
    setView((v) => ({ ...v, page: change(v.page) }));
  const addToPlaylist = usePlaylistActions();
  const [selection, setSelection] = useState<PlaylistSelection>([]);
  const all = collection.data?.[kind] ?? [];
  const ids = JSON.stringify(
    (kind === "track" ? all : all.slice((page - 1) * 24, page * 24)).map(
      (item) => item.id,
    ),
  );
  const resource = useResource(
    useCallback(
      async (signal) => {
        const selected: string[] = JSON.parse(ids);
        if (kind === "track") {
          const tracks = await readTrackDetails(selected, signal, true);
          return selected.map((id) => ({
            id,
            error: undefined as string | undefined,
            data: tracks[id]
              ? { kind: "track" as const, value: tracks[id]! }
              : null,
          }));
        }
        const results = await Promise.all(
          selected.map(async (id) => {
            try {
              return {
                id,
                data: await loadReference(kind, id, signal),
                failure: undefined as unknown,
              };
            } catch (error) {
              return {
                id,
                data: null,
                failure:
                  error instanceof RequestError &&
                  [403, 404].includes(error.status)
                    ? undefined
                    : error,
              };
            }
          }),
        );
        const failure = results.find((item) => item.failure)?.failure;
        if (failure && !results.some((item) => !item.data && !item.failure))
          throw failure;
        // En cas de panne mêlée à une révocation, aucune ancienne carte privée n’est conservée.
        return results.map(({ id, data, failure }) => ({
          id,
          data,
          error: failure ? "Temporarily unavailable" : undefined,
        }));
      },
      [ids, kind],
    ),
    true,
    `${kind}:${kind === "track" ? "all" : page}`,
  );
  return (
    <>
      {collection.error && (
        <p role="alert">
          {translateError(collection.error)}
          <button onClick={collection.reload}>{t("Retry library")}</button>
        </p>
      )}
      {resource.error && (
        <p role="alert">
          {translateError(resource.error)}
          <button onClick={resource.reload}>{t("Retry details")}</button>
        </p>
      )}
      {collection.loading || resource.loading ? (
        <p role="status">{t("Loading library…")}</p>
      ) : (
        <>
          {kind === "track" && (
            <div className="playlist-toolbar">
              <button
                disabled={!selection.length}
                onClick={() => addToPlaylist?.(selection)}
              >
                {t("Add selection to playlist ({count})", {
                  count: formatNumber(selection.length),
                })}
              </button>
              {!!selection.length && (
                <button onClick={() => setSelection([])}>
                  {" "}
                  {t("Clear selection")}{" "}
                </button>
              )}
            </div>
          )}
          {!all.length && (
            <p>
              {" "}
              {t(
                "Nothing saved here yet. Explore the catalogue to add something you love.",
              )}{" "}
            </p>
          )}
          <div className={kind === "track" ? "music-track-list" : "music-grid"}>
            {(kind === "track"
              ? resource.data?.slice((page - 1) * 24, page * 24)
              : resource.data
            )?.map(({ id, data, error }) => {
              if (!data)
                return (
                  <div className="music-unavailable" key={id}>
                    <span>
                      {translateError(error) || t("Item unavailable")}
                    </span>
                    {error && (
                      <button onClick={resource.reload}>
                        {t("Retry details")}
                      </button>
                    )}
                    <CollectionButton kind={kind} id={id} />
                  </div>
                );
              if (data.kind === "track")
                return (
                  <div className="playlist-select-row" key={id}>
                    <input
                      type="checkbox"
                      aria-label={t("Select {0}", { "0": data.value.title })}
                      checked={selection.some((t) => t.id === id)}
                      disabled={
                        selection.length >= 500 &&
                        !selection.some((t) => t.id === id)
                      }
                      onChange={(e) =>
                        setSelection((items) =>
                          e.target.checked
                            ? [...items, data.value]
                            : items.filter((t) => t.id !== id),
                        )
                      }
                    />
                    <MusicTrackRow
                      track={data.value}
                      queue={resource.data?.flatMap((item) =>
                        item.data?.kind === "track" ? [item.data.value] : [],
                      )}
                      source="Liked tracks"
                      sourceLocalized
                    />
                  </div>
                );
              return (
                <div key={id}>
                  {data.kind === "project" ? (
                    <ProjectCard project={data.value} />
                  ) : (
                    <ArtistCard artist={data.value} />
                  )}
                  <CollectionButton kind={kind} id={id} />
                  {data.kind === "project" && (
                    <button
                      disabled={!data.value.tracks.length}
                      onClick={() => addToPlaylist?.(data.value.tracks)}
                    >
                      {" "}
                      {t("Add project to playlist")}{" "}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      <RefreshNotice error={resource.refreshError} retry={resource.reload} />
      <nav className="music-pagination" aria-label={t("Library pagination")}>
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          {" "}
          {t("Previous")}{" "}
        </button>
        <span>{t("Page {page}", { page: formatNumber(page) })}</span>
        <button
          disabled={page * 24 >= all.length}
          onClick={() => setPage((p) => p + 1)}
        >
          {" "}
          {t("Next")}{" "}
        </button>
      </nav>
    </>
  );
}
/** Retrouve les publications et brouillons du compte dans leur section dédiée. */
function UploadsSection({ onUploads }: { onUploads: () => void }) {
  useLanguage();
  const [page, setPage] = useState(1);
  const resource = useResource(
    useCallback((signal) => getProjects(true, page, "", signal), [page]),
  );
  return (
    <>
      <button onClick={onUploads}>{t("Upload or edit a project")}</button>
      {resource.error && (
        <p role="alert">
          {translateError(resource.error)}
          <button onClick={resource.reload}>{t("Retry")}</button>
        </p>
      )}
      {resource.loading && <p role="status">{t("Loading your uploads…")}</p>}
      <div className="music-grid">
        {resource.data?.items.map((project) =>
          project.status === "published" ? (
            <ProjectCard key={project.id} project={project} />
          ) : (
            <button key={project.id} className="music-card" onClick={onUploads}>
              <strong>{project.title}</strong>
              <span>
                {t("Draft ·")} {translateCount(project.tracks.length, "track")}
              </span>
            </button>
          ),
        )}
      </div>
      {resource.data?.items.length === 0 && <p>{t("No uploads yet.")}</p>}
      <nav className="music-pagination">
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          {" "}
          {t("Previous")}{" "}
        </button>
        <span>{t("Page {page}", { page: formatNumber(page) })}</span>
        <button
          disabled={page * 24 >= (resource.data?.total ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          {" "}
          {t("Next")}{" "}
        </button>
      </nav>
    </>
  );
}
/** Bibliothèque organisée en sections, avec playlists créées distinctes des playlists enregistrées. */
export default function LibraryPage({
  library,
  onUploads,
  route,
}: {
  library: ReturnType<typeof useLibrary>;
  onUploads: () => void;
  route?: string;
}) {
  useLanguage();
  const [section, detailId] = (route ?? "track").split("/");
  const [selection, setSelection] = useState<PlaylistSelection | null>(null);
  const sections = [
    ["track", "Liked tracks"],
    ["project", "Saved projects"],
    ["artist", "Followed artists"],
    ["owned", "My playlists"],
    ["playlist", "Saved playlists"],
    ["uploads", "My uploads"],
    ["history", "History"],
  ] as const;
  return (
    <PlaylistActionsContext.Provider value={setSelection}>
      <main className="music-page">
        <header>
          <p className="page-label">{t("YOUR MUSIC")}</p>
          <h1>{t("Library")}</h1>
        </header>
        <nav className="music-tabs" aria-label={t("Library sections")}>
          {sections.map(([key, label]) => (
            <button
              key={key}
              aria-pressed={section === key}
              onClick={() => openMusic("library", key)}
            >
              {t(label)}
            </button>
          ))}
        </nav>
        {detailId && (section === "owned" || section === "playlist") ? (
          <PlaylistDetailPage
            key={`${section}:${detailId}`}
            id={detailId}
            owned={section === "owned"}
            library={library}
          />
        ) : section === "owned" || section === "playlist" ? (
          <PlaylistCollection
            key={section}
            owned={section === "owned"}
            library={library}
          />
        ) : section === "history" ? (
          <HistoryPage />
        ) : section === "uploads" ? (
          <UploadsSection onUploads={onUploads} />
        ) : (
          <SavedSection key={section} kind={section as SavedKind} />
        )}
        {selection && (
          <PlaylistPicker
            tracks={selection}
            library={library}
            onClose={() => setSelection(null)}
          />
        )}
      </main>
    </PlaylistActionsContext.Provider>
  );
}
