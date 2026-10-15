import { translate as t, translateError } from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import EmptyArtwork from "./EmptyArtwork";
/** Formulaire de projet ; les transferts et sauvegardes appartiennent à useProjectUpload. */
import { useEffect, useRef, useState } from "react";
import { useProjectUpload } from "../hooks/useProjectUpload";
import type { MusicProject, ProjectType } from "../types/projects";
import AudioCover from "./AudioCover";
import ProjectArtwork from "./ProjectArtwork";
/** Affiche une seule session d’édition, les fichiers et la progression confirmée. */
export default function ProjectUploadForm({
  initial,
  onSaved,
  onPublished,
}: {
  /** Brouillon/publication à modifier, ou nouveau projet. */ initial: MusicProject | null;
  /** Actualise la liste personnelle après confirmation. */ onSaved: (
    p: MusicProject,
  ) => void;
  /** Ouvre la publication confirmée. */ onPublished: (p: MusicProject) => void;
}) {
  useLanguage();
  const editor = useProjectUpload(initial, onSaved);
  const [preview, setPreview] = useState("");
  const previewUrl = useRef("");
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );
  /** Crée et libère l’aperçu au moment de la sélection, indépendamment de la sauvegarde. */
  function selectCover(file: File | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = file ? URL.createObjectURL(file) : "";
    setPreview(previewUrl.current);
    editor.setCover(file);
  }
  const disabled = editor.busy || editor.sending;
  const artwork =
    editor.rows.find((r) => r.audioAssetId === editor.coverId)?.asset ??
    editor.rows[0]?.asset;
  return (
    <form
      className="publish-form"
      onSubmit={(event) => {
        event.preventDefault();
        void editor.save(true);
      }}
    >
      <div
        className="project-type-picker"
        role="group"
        aria-label={t("Release type")}
      >
        {(["single", "album", "mixtape", "ep"] as ProjectType[]).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={editor.type === type}
            disabled={disabled || (type === "single" && editor.rows.length > 1)}
            onClick={() => editor.setType(type)}
          >
            {type === "single"
              ? t("Single track")
              : type === "ep"
                ? t("EP")
                : t(type[0].toUpperCase() + type.slice(1))}
          </button>
        ))}
      </div>
      <div
        className="audio-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          editor.add(Array.from(event.dataTransfer.files));
        }}
      >
        <span className="upload-symbol" aria-hidden="true">
          ↑
        </span>
        <h2>{t("Drop your music here")}</h2>
        <label className="upload-file-label">
          {" "}
          {t("Choose audio files")}{" "}
          <input
            aria-label={t("Audio files")}
            type="file"
            accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.opus"
            multiple={editor.type !== "single"}
            disabled={disabled}
            onChange={(event) => {
              editor.add(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </label>
        <p>
          {" "}
          {t(
            "Up to 500 MB per track · Your work stays in a draft until you publish.",
          )}{" "}
        </p>
      </div>
      <div className="publish-layout">
        <div className="publish-artwork">
          <div className="publish-artwork-preview">
            {editor.cover ? (
              <img src={preview} alt={t("Selected artwork")} />
            ) : editor.saved?.coverUrl && editor.coverId ? (
              <img src={editor.saved.coverUrl} alt={t("Project artwork")} />
            ) : editor.coverId && !editor.defaultCover ? (
              <ProjectArtwork assetId={editor.coverId} personal />
            ) : artwork && !editor.defaultCover ? (
              <AudioCover file={artwork} />
            ) : (
              <EmptyArtwork className="publish-artwork-placeholder" />
            )}
          </div>
          <label>
            {" "}
            {t("Artwork")}{" "}
            <input
              aria-label={t("Cover image")}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={disabled}
              onChange={(event) => selectCover(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              selectCover(null);
              editor.removeCover();
            }}
          >
            {" "}
            {t("Use default artwork")}{" "}
          </button>
          <p className="publish-help">
            {" "}
            {t("Optional · JPG, PNG or WebP · Up to 25 MB")}{" "}
          </p>
        </div>
        <div className="publish-fields">
          <label>
            {" "}
            {t("Title")}{" "}
            <input
              aria-label={t("Project title")}
              value={editor.title}
              maxLength={200}
              placeholder={
                editor.type === "single"
                  ? t("Untitled track")
                  : t("Untitled project")
              }
              disabled={disabled}
              onChange={(event) => editor.setTitle(event.target.value)}
            />
          </label>
          <label>
            {" "}
            {t("Description")}{" "}
            <textarea
              rows={4}
              value={editor.description}
              maxLength={5000}
              disabled={disabled}
              onChange={(event) => editor.setDescription(event.target.value)}
            />
          </label>
          <ol className="upload-track-list">
            {editor.rows.map((row, index) => (
              <li key={row.key}>
                <span className="track-number">{index + 1}</span>
                <div>
                  <input
                    aria-label={t("Track {0} title", { "0": index + 1 })}
                    value={row.title}
                    maxLength={200}
                    disabled={disabled}
                    onChange={(event) =>
                      editor.rename(row.key, event.target.value)
                    }
                  />
                  <small>
                    {row.state === "ready"
                      ? t("✓ Ready")
                      : row.state === "waiting"
                        ? t("Waiting")
                        : row.state === "error"
                          ? translateError(row.error)
                          : row.progress?.phase === "validating"
                            ? t("Preparing audio…")
                            : t("Uploading {0}%", {
                                "0": row.progress?.percent ?? 0,
                              })}
                  </small>
                  {row.progress?.phase === "sending" && (
                    <progress
                      max={100}
                      value={row.progress.percent ?? undefined}
                      aria-label={t("Upload {0}", { "0": index + 1 })}
                    />
                  )}
                </div>
                <div className="track-row-actions">
                  <button
                    type="button"
                    aria-label={t("Move track {0} up", { "0": index + 1 })}
                    disabled={disabled || index === 0}
                    onClick={() => editor.move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={t("Move track {0} down", { "0": index + 1 })}
                    disabled={disabled || index === editor.rows.length - 1}
                    onClick={() => editor.move(index, 1)}
                  >
                    ↓
                  </button>
                  {row.state === "error" && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void editor.retry(row)}
                    >
                      {" "}
                      {t("Retry")}{" "}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={t("Remove track {0}", { "0": index + 1 })}
                    onClick={() => editor.remove(row.key)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <footer className="publish-footer">
        <p>
          {editor.saved?.status === "published"
            ? t("Your project is published.")
            : t("Only you can see this draft.")}
        </p>
        <div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void editor.save(false)}
          >
            {editor.busy
              ? t("Saving…")
              : editor.saved?.status === "published"
                ? t("Save changes")
                : t("Save draft")}
          </button>
          <button
            className="publish-primary"
            type="submit"
            disabled={
              disabled ||
              !editor.rows.length ||
              editor.rows.some((r) => r.state !== "ready")
            }
          >
            {editor.busy
              ? t("Saving…")
              : editor.saved?.status === "published"
                ? t("Save publication")
                : t("Publish")}
          </button>
        </div>
      </footer>
      {editor.error && (
        <p role="alert" className="publish-error">
          {translateError(editor.error)}
        </p>
      )}
      {editor.message && <p role="status">{translateError(editor.message)}</p>}
      {editor.saved?.status === "published" && (
        <button
          type="button"
          onClick={() => {
            if (editor.saved) onPublished(editor.saved);
          }}
        >
          {" "}
          {t("View in catalogue")}{" "}
        </button>
      )}
    </form>
  );
}
