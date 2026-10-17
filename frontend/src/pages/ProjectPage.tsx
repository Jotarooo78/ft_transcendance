import {
  translate as t,
  translateError,
  translateState,
  translateCount,
  formatDate,
} from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import RefreshNotice from "../components/RefreshNotice";
import CollectionButton from "../components/CollectionButton";
/** Présentation publique d’un album, EP, mixtape ou titre seul. */
import { useCallback } from "react";
import { useResource } from "../hooks/useResource";
import { getProject } from "../services/projects";
import { openMusic } from "../services/music-navigation";
import { useMusicPlayer } from "../contexts/music-player";
import ProjectArtwork from "../components/ProjectArtwork";
import MusicTrackRow from "../components/MusicTrackRow";
/** Lit le projet et transmet son ordre au lecteur commun. */
export default function ProjectPage({
  id,
}: {
  /** Identité de l’adresse courante. */ id: string;
}) {
  useLanguage();
  const resource = useResource(
    useCallback((signal) => getProject(id, false, signal), [id]),
  );
  const player = useMusicPlayer(),
    project = resource.data;
  if (!project)
    return (
      <main className="music-page">
        <p role={resource.error ? "alert" : "status"}>
          {translateError(resource.error) || t("Loading project…")}
        </p>
        {resource.error && (
          <button onClick={resource.reload}>{t("Retry")}</button>
        )}
      </main>
    );
  return (
    <main className="music-page project-page">
      <header className="project-hero">
        <ProjectArtwork url={project.coverUrl} />
        <div>
          <p className="page-label">
            {translateState(project.releaseType).toUpperCase()}
          </p>
          <h1>{project.title}</h1>
          <p>
            {project.artist && (
              <button
                className="artist-link"
                onClick={() => openMusic("artists", project.artist!.userId)}
              >
                {project.artist.displayName}
              </button>
            )}{" "}
            · {formatDate(project.releaseDate)} ·{" "}
            {translateCount(project.tracks.length, "track")}
          </p>
          <p className="track-description">{project.description}</p>
        </div>
      </header>
      <div className="music-section-heading">
        <button
          className="publish-primary"
          disabled={!project.tracks.length}
          onClick={() => {
            if (project.tracks[0])
              player.play(project.tracks[0], project.tracks, {
                source: project.title,
                restart: true,
              });
          }}
        >
          {" "}
          {t("Play project")}{" "}
        </button>
        <button
          disabled={!project.tracks.length}
          onClick={() => {
            const index = Math.floor(Math.random() * project.tracks.length);
            if (project.tracks[index])
              player.play(project.tracks[index], project.tracks, {
                index,
                source: project.title,
                shuffle: true,
                restart: true,
              });
          }}
        >
          {" "}
          {t("Shuffle play")}{" "}
        </button>
        <CollectionButton kind="project" id={id} />
      </div>
      <div className="music-track-list">
        {project.tracks.map((track, index) => (
          <MusicTrackRow
            key={track.id}
            track={track}
            queue={project.tracks}
            queueIndex={index}
            source={project.title}
            number={index + 1}
          />
        ))}
      </div>
      <RefreshNotice error={resource.refreshError} retry={resource.reload} />
    </main>
  );
}
