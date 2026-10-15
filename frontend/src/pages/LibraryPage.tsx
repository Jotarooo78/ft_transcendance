import {
  translate as t,
  translateError,
  translateCount,
  formatNumber,
} from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import { RequestError } from "../services/request-json";
import RefreshNotice from "../components/RefreshNotice";
import EmptyArtwork from "../components/EmptyArtwork";
import { useCallback, useState } from "react";
import { useCollections } from "../contexts/collections";
import { useResource } from "../hooks/useResource";
import type { useLibrary } from "../hooks/useLibrary";
import { readTrackDetails } from "../services/track-details";
import { getTrack } from "../services/catalog";
import { getProject, getProjects } from "../services/projects";
import { getPublicPlaylist } from "../services/library";
import { getArtist } from "../services/artists";
import { openMusic } from "../services/music-navigation";
import type { CollectionKind } from "../types/collections";
import MusicTrackRow from "../components/MusicTrackRow";
import ProjectCard from "../components/ProjectCard";
import ArtistCard from "../components/ArtistCard";
import CollectionButton from "../components/CollectionButton";
import PlaylistsPage from "./PlaylistsPage";
/** Relit les détails publics : une référence ne garde jamais le contenu d'une playlist devenue privée. */
async function loadReference(
  kind: CollectionKind,
  id: string,
  signal: AbortSignal,
) {
  if (kind === "track")
    return { kind, value: await getTrack(id, signal) } as const;
  if (kind === "project")
    return { kind, value: await getProject(id, false, signal) } as const;
  if (kind === "playlist")
    return { kind, value: await getPublicPlaylist(id, signal) } as const;
  return { kind, value: await getArtist(id, signal) } as const;
}
/** Liste une section avec ses indisponibilités et son retrait toujours possible. */
function SavedSection({ kind }: { kind: CollectionKind }) {
  useLanguage();
  const collection = useCollections()!,
    [page, setPage] = useState(1);
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
                  <MusicTrackRow
                    key={id}
                    track={data.value}
                    queue={resource.data?.flatMap((item) =>
                      item.data?.kind === "track" ? [item.data.value] : [],
                    )}
                    source="Liked tracks"
                    sourceLocalized
                  />
                );
              return (
                <div key={id}>
                  {data.kind === "project" ? (
                    <ProjectCard project={data.value} />
                  ) : data.kind === "artist" ? (
                    <ArtistCard artist={data.value} />
                  ) : (
                    <button
                      className="music-card playlist-card"
                      onClick={() => openMusic("playlists", id)}
                    >
                      <EmptyArtwork className="playlist-artwork" />
                      <strong>{data.value.name}</strong>
                      <span>
                        {translateCount(data.value.items.length, "track")} ·{" "}
                        {t("Public playlist")}{" "}
                      </span>
                    </button>
                  )}
                  <CollectionButton kind={kind} id={id} />
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
}: {
  library: ReturnType<typeof useLibrary>;
  onUploads: () => void;
}) {
  useLanguage();
  const [section, setSection] = useState<CollectionKind | "owned" | "uploads">(
    "track",
  );
  const sections = [
    ["track", "Liked tracks"],
    ["project", "Saved projects"],
    ["artist", "Followed artists"],
    ["owned", "My playlists"],
    ["playlist", "Saved playlists"],
    ["uploads", "My uploads"],
  ] as const;
  return (
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
            onClick={() => setSection(key)}
          >
            {t(label)}
          </button>
        ))}
      </nav>
      {section === "owned" ? (
        <PlaylistsPage
          playlists={library.playlists}
          loading={library.loading}
          error={library.error}
          refreshError={library.refreshError}
          onRetry={library.reload}
          onCreate={library.create}
          onRemoveItem={library.removeItem}
          onUpdate={library.update}
          onDelete={library.remove}
        />
      ) : section === "uploads" ? (
        <UploadsSection onUploads={onUploads} />
      ) : (
        <SavedSection key={section} kind={section} />
      )}
    </main>
  );
}
