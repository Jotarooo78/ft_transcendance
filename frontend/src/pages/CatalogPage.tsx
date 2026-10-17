import {
  translate as t,
  translateError,
  formatNumber,
} from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import RefreshNotice from "../components/RefreshNotice";
/** Hub musical : une recherche et trois familles de résultats indépendantes. */
import { useCallback, useState } from "react";
import { useResource } from "../hooks/useResource";
import { getArtists } from "../services/artists";
import { getProjects } from "../services/projects";
import { getTracks } from "../services/catalog";
import ArtistCard from "../components/ArtistCard";
import ProjectCard from "../components/ProjectCard";
import MusicTrackRow from "../components/MusicTrackRow";
import type { MusicPlaylist, Track } from "../types/music";
/** Catégorie affichée ; All conserve les trois sections du hub. */
type Category = "all" | "artists" | "projects" | "tracks";
/** Affiche les résultats du serveur et refuse de remplacer une recherche récente par une réponse ancienne. */
export default function CatalogPage({
  playlists,
  onAddItem,
}: {
  /** Playlists du propriétaire disponibles pour ajouter un morceau. */ playlists: MusicPlaylist[];
  /** Ajout confirmé côté Library. */ onAddItem: (
    playlist: MusicPlaylist,
    trackId: string,
  ) => Promise<MusicPlaylist>;
  /** Ancien point d’entrée conservé durant la transition de navigation. */ initialTrack?: Track | null;
}) {
  useLanguage();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<Category>("all"),
    [page, setPage] = useState(1);
  const [message, setMessage] = useState(""),
    [adding, setAdding] = useState(false);
  const resource = useResource(
    useCallback(
      async (signal) => {
        const [artists, projects, tracks] = await Promise.all([
          category === "all" || category === "artists"
            ? getArtists(query, page, signal)
            : null,
          category === "all" || category === "projects"
            ? getProjects(false, page, query, signal)
            : null,
          category === "all" || category === "tracks"
            ? getTracks(
                {
                  q: query,
                  page,
                  pageSize: 24,
                  genre: "",
                  sort: query ? "title" : "recent",
                },
                signal,
              )
            : null,
        ]);
        return { artists, projects, tracks };
      },
      [query, category, page],
    ),
  );
  /** Change de catégorie en repartant de sa première page. */
  function select(next: Category) {
    setCategory(next);
    setPage(1);
  }
  /** Ajoute un titre et n’affiche un succès qu’après confirmation serveur. */
  async function add(track: Track, id: string) {
    const playlist = playlists.find((p) => p.id === id);
    if (!playlist || adding) return;
    setAdding(true);
    setMessage("");
    try {
      await onAddItem(playlist, track.id);
      setMessage(`Added to ${playlist.name}.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to add track.",
      );
    } finally {
      setAdding(false);
    }
  }
  const data = resource.data,
    limit = category === "all" ? 6 : 24,
    total =
      category === "artists"
        ? data?.artists?.total
        : category === "projects"
          ? data?.projects?.total
          : data?.tracks?.total;
  return (
    <main className="music-page catalog-hub">
      <header>
        <p className="page-label">{t("DISCOVER")}</p>
        <h1>{t("Find your next sound.")}</h1>
      </header>
      <input
        className="music-search"
        aria-label={t("Search music")}
        type="search"
        placeholder={t("Artists, projects, tracks")}
        value={query}
        maxLength={200}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />
      {(query || category !== "all") && (
        <div
          className="music-tabs"
          role="group"
          aria-label={t("Search category")}
        >
          {(["all", "artists", "projects", "tracks"] as Category[]).map(
            (item) => (
              <button
                key={item}
                aria-pressed={category === item}
                onClick={() => select(item)}
              >
                {t(item[0].toUpperCase() + item.slice(1))}
              </button>
            ),
          )}
        </div>
      )}
      {resource.loading ? (
        <p role="status">{t("Searching your music…")}</p>
      ) : resource.error ? (
        <div role="alert">
          {translateError(resource.error)}
          <button onClick={resource.reload}>{t("Retry")}</button>
        </div>
      ) : (
        <>
          {data?.artists && (
            <section>
              <div className="music-section-heading">
                <h2>{t("Artists")}</h2>
                {category === "all" && (
                  <button onClick={() => select("artists")}>
                    {" "}
                    {t("See all artists")}{" "}
                  </button>
                )}
              </div>
              <div className="music-grid">
                {data.artists.items.slice(0, limit).map((artist) => (
                  <ArtistCard key={artist.userId} artist={artist} />
                ))}
              </div>
              {!data.artists.total && <p>{t("No artists found.")}</p>}
            </section>
          )}
          {data?.projects && (
            <section>
              <div className="music-section-heading">
                <h2>{t("Projects")}</h2>
                {category === "all" && (
                  <button onClick={() => select("projects")}>
                    {" "}
                    {t("See all projects")}{" "}
                  </button>
                )}
              </div>
              <div className="music-grid">
                {data.projects.items.slice(0, limit).map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
              {!data.projects.total && <p>{t("No projects found.")}</p>}
            </section>
          )}
          {data?.tracks && (
            <section>
              <div className="music-section-heading">
                <h2>{t("Tracks")}</h2>
                {category === "all" && (
                  <button onClick={() => select("tracks")}>
                    {" "}
                    {t("See all tracks")}{" "}
                  </button>
                )}
              </div>
              <div className="music-track-list">
                {data.tracks.items.slice(0, limit).map((track) => (
                  <MusicTrackRow
                    key={track.id}
                    track={track}
                    queue={
                      query.trim()
                        ? undefined
                        : data.tracks!.items.slice(0, limit)
                    }
                    source={query.trim() ? "Search" : "Catalogue"}
                    sourceLocalized
                    extra={
                      playlists.length > 0 ? (
                        <select
                          aria-label={t("Add {0} to playlist", {
                            "0": track.title,
                          })}
                          value=""
                          disabled={adding}
                          onChange={(event) =>
                            void add(track, event.target.value)
                          }
                        >
                          <option value="">{t("Add to playlist")}</option>
                          {playlists.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : undefined
                    }
                  />
                ))}
              </div>
              {!data.tracks.total && <p>{t("No tracks found.")}</p>}
            </section>
          )}
          {category !== "all" && !!total && (
            <div className="music-pagination">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {" "}
                {t("Previous")}{" "}
              </button>
              <span>
                {" "}
                {t("Page {page} of {pages}", {
                  page: formatNumber(page),
                  pages: formatNumber(Math.ceil(total / 24)),
                })}
              </span>
              <button
                disabled={page * 24 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                {" "}
                {t("Next")}{" "}
              </button>
            </div>
          )}
        </>
      )}
      {message && <p role="status">{translateError(message)}</p>}
      <RefreshNotice error={resource.refreshError} retry={resource.reload} />
    </main>
  );
}
