/** Ajout public d’un morceau : transfert immédiat, édition simultanée et publication confirmée séparément. */
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { validateFile } from "../services/validate-file";
import { sendFile } from "../services/send-file";
import { replaceAudioCover, removeAudioCover } from "../services/update-audio-cover";
import { deleteFile } from "../services/delete-file";
import { publishTrack, PublicationRejected } from "../services/publish-track";
import type { ReadyFile, UploadProgress } from "../types/files";
import type { AuthenticatedUser } from "../types/auth";
import type { Track } from "../types/music";
import AudioCover from "./AudioCover";

/** Identité non éditable et navigation vers le morceau confirmé dans Catalogue. */
type Props = {
  /** Compte connecté ; le serveur vérifie indépendamment l’identité réelle. */
  user: AuthenticatedUser;
  /** Ouvre le morceau nouvellement publié. */
  onPublished: (track: Track) => void;
};
/** Définit si le visuel vient du MP3, d’une sélection manuelle ou d’un retrait explicite. */
type CoverChoice = "embedded" | "manual" | "none";

/** Gère un seul audio provisoire ; un démontage interrompt les requêtes, sans supprimer une publication incertaine. */
export default function FileUploadForm({ user, onPublished }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [asset, setAsset] = useState<ReadyFile | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [coverChoice, setCoverChoice] = useState<CoverChoice>("embedded");
  const [coverUrl, setCoverUrl] = useState("");
  const coverObjectUrl = useRef("");
  const [coverError, setCoverError] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publicationAttempted, setPublicationAttempted] = useState(false);
  const [published, setPublished] = useState<Track | null>(null);
  const [dragging, setDragging] = useState(false);
  const current = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const coverInput = useRef<HTMLInputElement | null>(null);
  const coverValidation = useRef<AbortController | null>(null);
  const [checkingCover, setCheckingCover] = useState(false);
  useEffect(() => () => { current.current?.abort(); coverValidation.current?.abort(); }, []);
  useEffect(() => () => { if (coverObjectUrl.current) URL.revokeObjectURL(coverObjectUrl.current); }, []);
  const uploading = checking || progress !== null;

  /** Prévalide puis envoie un audio provisoire ; une nouvelle tentative conserve le texte déjà saisi. */
  async function upload(selected: File, retry = false) {
    if (current.current || published) return;
    const controller = new AbortController(); current.current = controller;
    setFile(selected); setError(""); setChecking(true); setAsset(null);
    if (!retry) { setTitle(selected.name.replace(/\.[^.]+$/, "").slice(0, 200)); setDescription(""); setCover(null); setCoverChoice("embedded"); setCoverError(""); }
    try {
      await validateFile(selected, controller.signal);
      if (controller.signal.aborted) return;
      setChecking(false);
      setProgress({ phase: "sending", percent: 0, loaded: 0, total: null });
      const saved = await sendFile(selected, setProgress, controller.signal, true);
      if (!controller.signal.aborted) setAsset(saved);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to upload this audio.");
    } finally {
      if (current.current === controller) { current.current = null; setChecking(false); setProgress(null); }
    }
  }

  /** Vérifie la pochette sans bloquer le transfert audio ; un retrait interrompt cette vérification. */
  async function selectCover(selected: File | null) {
    coverValidation.current?.abort();
    if (coverObjectUrl.current) URL.revokeObjectURL(coverObjectUrl.current);
    coverObjectUrl.current = selected ? URL.createObjectURL(selected) : ""; setCoverUrl(coverObjectUrl.current);
    setCover(selected); setCoverChoice(selected ? "manual" : "none"); setCoverError("");
    if (!selected) { setCheckingCover(false); return; }
    const controller = new AbortController(); coverValidation.current = controller; setCheckingCover(true);
    try { await validateFile(selected, controller.signal, "image"); }
    catch (failure) { if (!controller.signal.aborted) setCoverError(failure instanceof Error ? failure.message : "Choose another cover."); }
    finally { if (!controller.signal.aborted) setCheckingCover(false); }
  }

  /** Annule un envoi ou abandonne un audio confirmé avant toute tentative de publication. */
  async function cancel() {
    current.current?.abort(); current.current = null;
    coverValidation.current?.abort();
    if (asset && !publicationAttempted) {
      try { await deleteFile(asset.id, new AbortController().signal); }
      catch { setError("This upload could not be removed now. It will be cleaned up after it expires."); return; }
    }
    setFile(null); setAsset(null); setProgress(null); setChecking(false); setCover(null); setError(""); setCoverError(""); setCheckingCover(false);
    if (input.current) input.current.value = "";
  }

  /** Confirme le visuel voulu puis publie ; après un résultat incertain, seul le même audio est réessayé. */
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset || !title.trim() || publishing || checkingCover || coverError || uploading || current.current) return;
    const controller = new AbortController(); current.current = controller;
    setPublishing(true); setError("");
    try {
      if (coverChoice === "manual" && cover) {
        try {
          const saved = await replaceAudioCover(asset.id, cover, controller.signal);
          if (controller.signal.aborted) return;
          setAsset({ ...asset, cover: saved }); setCoverChoice("embedded"); setCover(null);
        } catch (failure) {
          if (!controller.signal.aborted) setCoverError(failure instanceof Error ? failure.message : "Cover upload failed. Choose another cover or continue without one.");
          return;
        }
      } else if (coverChoice === "none") await removeAudioCover(asset.id, controller.signal);
      if (controller.signal.aborted) return;
      setPublicationAttempted(true);
      const track = await publishTrack(asset.id, title, description, controller.signal);
      if (!controller.signal.aborted) setPublished(track);
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof PublicationRejected) setPublicationAttempted(false);
        setError(failure instanceof Error ? failure.message : "Unable to confirm publication. Please retry.");
      }
    }
    finally { if (current.current === controller) { current.current = null; setPublishing(false); } }
  }

  if (published) return <section className="publish-success" aria-live="polite">
    <span className="publish-success-icon" aria-hidden="true">✓</span><h2>Your track is live</h2>
    <p><strong>{published.title}</strong> is now in the catalogue.</p>
    <button className="publish-primary" onClick={() => onPublished(published)}>View in catalogue</button>
  </section>;

  return <form className="publish-form" onSubmit={submit}>
    {!file ? <div className={`audio-dropzone${dragging ? " is-dragging" : ""}`}
      onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length !== 1) { setError("Choose one audio file at a time."); return; } const selected = event.dataTransfer.files[0]; if (selected) void upload(selected); }}>
      <span className="upload-symbol" aria-hidden="true">↑</span><h2>Drag and drop your track here</h2><p>Share your sound with the community.</p>
      <button className="publish-primary" type="button" onClick={() => input.current?.click()}>Choose a file</button>
      <input className="visually-hidden" id="track-audio" aria-label="Audio file" ref={input} type="file" accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.aiff,.wma" onChange={event => { const selected = event.target.files?.[0]; if (selected) void upload(selected); }} />
      <p className="publish-help">One audio file · Up to 500 MB</p>
    </div> : <>
      <div className="upload-status" aria-live="polite">
        <span className="upload-filename">{file.name}</span>
        {progress?.phase === "sending" && <><progress aria-label="Upload progress" max={100} {...(progress.percent === null ? {} : { value: progress.percent })} /><span>{progress.percent === null ? "Uploading…" : `${progress.percent}%`}</span></>}
        {checking && <span>Checking audio…</span>}
        {progress?.phase === "validating" && <span>Processing audio…</span>}
        {!uploading && asset && <span className="upload-ready">✓ Audio ready</span>}
      </div>
      <div className="publish-layout">
        <div className="publish-artwork">
          <div className="publish-artwork-preview">
            {coverChoice === "manual" && cover && coverUrl ? <img src={coverUrl} alt="Selected cover" /> : coverChoice === "embedded" && asset ? <AudioCover file={asset} /> : <div className="publish-artwork-placeholder" aria-label="No cover">♪</div>}
            <button type="button" className="cover-select" disabled={publishing} onClick={() => coverInput.current?.click()}>Choose artwork</button>
          </div>
          <input className="visually-hidden" aria-label="Cover image" ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={publishing} onChange={event => void selectCover(event.target.files?.[0] ?? null)} />
          {(cover || asset?.cover) && coverChoice !== "none" && <button type="button" className="publish-text-button" disabled={publishing} onClick={() => void selectCover(null)}>Remove artwork</button>}
          <p className="publish-help">Artwork is optional.<br />JPG, PNG or WebP · Up to 25 MB</p>
          {checkingCover && <p role="status">Checking artwork…</p>}
          {coverError && <div role="alert"><p>{coverError}</p><button type="button" onClick={() => void selectCover(null)}>Continue without artwork</button></div>}
          {asset?.warning && coverChoice === "embedded" && <p role="status">The embedded artwork could not be used. You can choose another image.</p>}
        </div>
        <div className="publish-fields">
          <label htmlFor="track-title">Title <span aria-hidden="true">*</span></label>
          <input id="track-title" value={title} required maxLength={200} disabled={publishing || publicationAttempted} onChange={event => setTitle(event.target.value)} />
          <span className="publish-label">Artist</span>
          <div className="publishing-artist">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span className="artist-avatar-placeholder" aria-hidden="true">{user.displayName.slice(0, 1)}</span>}<div><strong>{user.displayName}</strong><span>@{user.username}</span></div></div>
          <label htmlFor="track-description">Description <span className="publish-optional">(optional)</span></label>
          <textarea id="track-description" rows={6} maxLength={5000} placeholder="Tell the story behind your track. Add credits or lyrics…" value={description} disabled={publishing || publicationAttempted} onChange={event => setDescription(event.target.value)} />
          <span className="publish-counter">{description.length} / 5,000</span>
        </div>
      </div>
      <footer className="publish-footer"><p>Your track will be public when you publish it.</p><div>
        {!publicationAttempted && <button type="button" className="publish-text-button" disabled={publishing} onClick={() => void cancel()}>{uploading ? "Cancel upload" : "Cancel"}</button>}
        {!asset && !uploading && <button type="button" onClick={() => void upload(file, true)}>Retry upload</button>}
        <button className="publish-primary" type="submit" disabled={!asset || uploading || publishing || checkingCover || !!coverError || !title.trim()}>{publishing ? "Publishing…" : publicationAttempted ? "Retry publication" : "Publish track"}</button>
      </div></footer>
    </>}
    {error && <p role="alert" className="publish-error">{error}</p>}
  </form>;
}
