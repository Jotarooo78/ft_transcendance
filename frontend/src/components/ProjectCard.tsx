import {
  translate as t,
  translateState,
  translateCount,
} from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
/** Carte de projet utilisée par le hub et les collections personnelles. */
import type { MusicProject } from "../types/projects";
import { openMusic } from "../services/music-navigation";
import ProjectArtwork from "./ProjectArtwork";
/** Ouvre le projet publié par son adresse stable. */
export default function ProjectCard({
  project,
}: {
  /** Projet confirmé. */ project: MusicProject;
}) {
  useLanguage();
  return (
    <button
      data-scroll-anchor={project.id}
      className="music-card"
      onClick={() => openMusic("projects", project.id)}
    >
      <ProjectArtwork url={project.coverUrl} />
      <strong>{project.title}</strong>
      <span>{project.artist?.displayName ?? t("Various artists")}</span>
      <small>
        {translateState(project.releaseType).toUpperCase()} ·{" "}
        {translateCount(project.tracks.length, "track")}
      </small>
    </button>
  );
}
