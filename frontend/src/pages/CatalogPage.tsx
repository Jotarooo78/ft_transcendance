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
        <p className="page-label">DISCOVER</p>
        <h1>Find your next sound.</h1>
      </header>
      <input
        className="music-search"
        aria-label="Search music"
        type="search"
        placeholder="Artists, projects, tracks"
        value={query}
        maxLength={200}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />
      {(query || category !== "all") && (
        <div className="music-tabs" role="group" aria-label="Search category">
          {(["all", "artists", "projects", "tracks"] as Category[]).map(
            (item) => (
              <button
                key={item}
                aria-pressed={category === item}
                onClick={() => select(item)}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ),
          )}
        </div>
      )}
      {resource.loading ? (
        <p role="status">Searching your music…</p>
      ) : resource.error ? (
        <div role="alert">
          {resource.error}
          <button onClick={resource.reload}>Retry</button>
        </div>
      ) : (
        <>
          {data?.artists && (
            <section>
              <div className="music-section-heading">
                <h2>Artists</h2>
                {category === "all" && (
                  <button onClick={() => select("artists")}>
                    See all artists
                  </button>
                )}
              </div>
              <div className="music-grid">
                {data.artists.items.slice(0, limit).map((artist) => (
                  <ArtistCard key={artist.userId} artist={artist} />
                ))}
              </div>
              {!data.artists.total && <p>No artists found.</p>}
            </section>
          )}
          {data?.projects && (
            <section>
              <div className="music-section-heading">
                <h2>Projects</h2>
                {category === "all" && (
                  <button onClick={() => select("projects")}>
                    See all projects
                  </button>
                )}
              </div>
              <div className="music-grid">
                {data.projects.items.slice(0, limit).map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
              {!data.projects.total && <p>No projects found.</p>}
            </section>
          )}
          {data?.tracks && (
            <section>
              <div className="music-section-heading">
                <h2>Tracks</h2>
                {category === "all" && (
                  <button onClick={() => select("tracks")}>
                    See all tracks
                  </button>
                )}
              </div>
              <div className="music-track-list">
                {data.tracks.items.slice(0, limit).map((track) => (
                  <MusicTrackRow
                    key={track.id}
                    track={track}
                    queue={data.tracks!.items}
                    extra={
                      playlists.length > 0 ? (
                        <select
                          aria-label={`Add ${track.title} to playlist`}
                          value=""
                          disabled={adding}
                          onChange={(event) =>
                            void add(track, event.target.value)
                          }
                        >
                          <option value="">Add to playlist</option>
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
              {!data.tracks.total && <p>No tracks found.</p>}
            </section>
          )}
          {category !== "all" && !!total && (
            <div className="music-pagination">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.ceil(total / 24)}
              </span>
              <button
                disabled={page * 24 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
