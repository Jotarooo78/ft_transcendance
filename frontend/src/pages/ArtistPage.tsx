import CollectionButton from "../components/CollectionButton";
/** Profil musical d’un compte et ses projets publiés. */
import { useCallback, useState } from "react";
import { useResource } from "../hooks/useResource";
import { getProjects } from "../services/projects";
import { getArtist } from "../services/artists";
import { getTracks } from "../services/catalog";
import MusicTrackRow from "../components/MusicTrackRow";
import ProjectCard from "../components/ProjectCard";
/** Les profils viennent de Users ; leurs projets viennent de Catalogue. */
export default function ArtistPage({
  id,
}: {
  /** Compte artiste. */ id: string;
}) {
  const [page, setPage] = useState(1);
  const resource = useResource(
    useCallback(
      async (signal) => {
        const [artist, projects, tracks] = await Promise.all([
          getArtist(id, signal),
          getProjects(false, page, "", signal, id),
          getTracks(
            { page, pageSize: 24, q: "", genre: "", sort: "recent", owner: id },
            signal,
          ),
        ]);
        return { artist, projects, tracks };
      },
      [id, page],
    ),
  );
  const data = resource.data;
  return (
    <main className="music-page">
      {!data ? (
        <p role={resource.error ? "alert" : "status"}>
          {resource.error ?? "Loading artist…"}
          {resource.error && (
            <button onClick={resource.reload}>Retry artist</button>
          )}
        </p>
      ) : (
        <>
          <header className="project-hero artist-hero">
            {data.artist.avatarUrl && (
              <img src={data.artist.avatarUrl} alt="" />
            )}
            <div>
              <p className="page-label">ARTIST</p>
              <h1>{data.artist.displayName}</h1>
              <p>@{data.artist.username}</p>
              <p>{data.artist.bio}</p>
            </div>
          </header>
          <CollectionButton kind="artist" id={id} />
          <h2>Projects</h2>
          <div className="music-grid">
            {data.projects.items.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
          {!data.projects.items.length && <p>No published projects yet.</p>}
          <h2>Tracks</h2>
          <div className="music-track-list">
            {data.tracks.items.map((track) => (
              <MusicTrackRow
                key={track.id}
                track={track}
                queue={data.tracks.items}
              />
            ))}
          </div>
          <div className="music-pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>Page {page}</span>
            <button
              disabled={
                page * 24 >= Math.max(data.projects.total, data.tracks.total)
              }
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
