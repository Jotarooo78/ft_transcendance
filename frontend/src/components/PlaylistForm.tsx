/** Formulaire commun de création et d'édition ; conserve les saisies en cas de conflit. */
import { useState, type SubmitEvent } from "react";
import type { MusicPlaylist } from "../types/music";
import type { useLibrary } from "../hooks/useLibrary";
import { LibraryMutationError } from "../services/library";
import { uploadPlaylistImage } from "../services/playlist-actions";
/** Une sauvegarde de texte confirmée reste acquise si seul l'envoi de l'image échoue. */
export default function PlaylistForm({
  playlist,
  library,
  onDone,
  onCancel,
  onBusyChange,
}: {
  playlist?: MusicPlaylist;
  library: ReturnType<typeof useLibrary>;
  onDone: (playlist: MusicPlaylist) => void;
  onCancel: () => void;
  /** Empêche le dialogue parent de se fermer pendant la création qu'il héberge. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [base, setBase] = useState(playlist);
  const [name, setName] = useState(playlist?.name ?? "");
  const [description, setDescription] = useState(playlist?.description ?? "");
  const [visibility, setVisibility] = useState(
    playlist?.visibility ?? "private",
  );
  const [image, setImage] = useState<File | null>(null);
  const [clearImage, setClearImage] = useState(false);
  const [uploaded, setUploaded] = useState<{ file: File; id: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  /** Vérifie la version avant d'appliquer les champs, puis associe l'image validée par Media. */
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    if (playlist && base && playlist.version > base.version) {
      setBase(playlist);
      setError(
        "This playlist changed. Your inputs are preserved. Review them before saving again.",
      );
      return;
    }
    if (
      base &&
      visibility !== base.visibility &&
      !window.confirm(
        `Make this playlist ${visibility}? ${visibility === "public" ? "Everyone can view its contents." : "Its contents will no longer be publicly available."}`,
      )
    )
      return;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      let confirmed = base
        ? await library.update(
            base,
            name.trim(),
            description.trim(),
            visibility,
          )
        : await library.create(name.trim(), description.trim(), visibility);
      setBase(confirmed);
      if (image || clearImage) {
        const asset = image
          ? uploaded?.file === image
            ? uploaded.id
            : await uploadPlaylistImage(image)
          : null;
        if (image && asset) setUploaded({ file: image, id: asset });
        confirmed = await library.artwork(confirmed, asset);
        setBase(confirmed);
      }
      onDone(confirmed);
    } catch (reason) {
      if (reason instanceof LibraryMutationError && reason.playlist)
        setBase(reason.playlist);
      setError(
        reason instanceof Error ? reason.message : "Unable to save playlist.",
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <form
      className="playlist-edit-form"
      aria-label={playlist ? "Edit playlist" : "Create playlist"}
      onSubmit={submit}
    >
      <label>
        Name
        <input
          required
          maxLength={100}
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Description
        <textarea
          aria-label="Description"
          maxLength={2000}
          value={description}
          disabled={busy}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        Visibility
        <select
          aria-label="Visibility"
          value={visibility}
          disabled={busy}
          onChange={(e) =>
            setVisibility(e.target.value as MusicPlaylist["visibility"])
          }
        >
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>
      </label>
      <label>
        Cover image
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            setImage(e.target.files?.[0] ?? null);
            setClearImage(false);
          }}
        />
      </label>
      {base?.coverAssetId && (
        <label>
          <input
            type="checkbox"
            checked={clearImage}
            disabled={busy || !!image}
            onChange={(e) => setClearImage(e.target.checked)}
          />
          Use automatic artwork
        </label>
      )}
      <div className="playlist-toolbar">
        <button disabled={busy || !name.trim()}>
          {busy ? "Saving…" : playlist ? "Save changes" : "Create playlist"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
