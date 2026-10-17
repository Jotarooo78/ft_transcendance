import {
  translate as t,
  translateError,
  translateState,
  formatNumber,
} from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import RefreshNotice from "../components/RefreshNotice";
/** Espace de création et de reprise des projets personnels, persistants dans Catalogue. */
import { useCallback, useState } from "react";
import { openMusic } from "../services/music-navigation";
import ProjectUploadForm from "../components/ProjectUploadForm";
import { useResource } from "../hooks/useResource";
import { discardProject, getProjects } from "../services/projects";
import type { AuthenticatedUser } from "../types/auth";
import type { MusicProject } from "../types/projects";
/** Le compte sert de clé au parent pour éliminer les données de l’utilisateur précédent. */
export default function FilesPage({
  user,
}: {
  /** Compte connecté. */ user: AuthenticatedUser;
}) {
  useLanguage();
  const [page, setPage] = useState(1),
    [editorKey, setEditorKey] = useState("new");
  const [selected, setSelected] = useState<MusicProject | null>(null),
    [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const load = useCallback(
    (signal: AbortSignal) => getProjects(true, page, "", signal),
    [page],
  );
  const projects = useResource(load);
  /** Abandon confirmé ; conserve le brouillon sélectionné si le nettoyage échoue. */
  async function remove(project: MusicProject) {
    if (
      removing ||
      !window.confirm(
        t('Discard draft "{0}" and its files?', { "0": project.title }),
      )
    )
      return;
    setRemoving(true);
    setError("");
    try {
      await discardProject(project);
      setSelected(null);
      setEditorKey(crypto.randomUUID());
      projects.reload();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to discard. Please retry.",
      );
    } finally {
      setRemoving(false);
    }
  }
  return (
    <main className="publish-page">
      <header>
        <p className="publish-eyebrow">{t("CREATE & SHARE")}</p>
        <h1>{t("Upload your music")}</h1>
        <p>
          {" "}
          {t("A track, an EP, a mixtape, an album. Your sound,")}{" "}
          {user.displayName}.
        </p>
      </header>
      <section className="project-drafts">
        <div className="music-section-heading">
          <h2>{t("My uploads")}</h2>
          <button
            onClick={() => {
              setSelected(null);
              setEditorKey(crypto.randomUUID());
            }}
          >
            {" "}
            {t("New upload")}{" "}
          </button>
        </div>
        {projects.loading ? (
          <p role="status">{t("Loading your projects…")}</p>
        ) : projects.error ? (
          <p role="alert">
            {translateError(projects.error)}
            <button onClick={projects.reload}>{t("Retry")}</button>
          </p>
        ) : (
          <div className="draft-list">
            {projects.data?.items.map((project) => (
              <div key={project.id}>
                <button
                  onClick={() => {
                    setSelected(project);
                    setEditorKey(project.id + ":" + project.version);
                  }}
                >
                  <strong>{project.title}</strong>
                  <span>
                    {translateState(project.releaseType)} ·{" "}
                    {translateState(project.status)}
                  </span>
                </button>
                {project.status === "draft" && (
                  <button
                    disabled={removing}
                    onClick={() => void remove(project)}
                    aria-label={t("Discard {0}", { "0": project.title })}
                  >
                    {" "}
                    {t("Discard")}{" "}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {projects.data && projects.data.total > 24 && (
          <div className="music-pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {" "}
              {t("Previous")}{" "}
            </button>
            <span>{t("Page {page}", { page: formatNumber(page) })}</span>
            <button
              disabled={page * 24 >= projects.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              {" "}
              {t("Next")}{" "}
            </button>
          </div>
        )}
        {error && <p role="alert">{translateError(error)}</p>}
      </section>
      <ProjectUploadForm
        key={editorKey}
        initial={selected}
        onSaved={() => projects.reload()}
        onPublished={(project) => {
          openMusic("projects", project.id);
        }}
      />
      <RefreshNotice error={projects.refreshError} retry={projects.reload} />
    </main>
  );
}
