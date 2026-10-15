import {
  translate as t,
  translateError,
  translateState,
  translateCount,
} from "../services/translate";
import { useLanguage } from "../hooks/useLanguage";
import { LibraryMutationError } from "../services/library";
import RefreshNotice from "../components/RefreshNotice";
import { openMusic } from "../services/music-navigation";
import { useState, type SubmitEvent } from "react";
import type { MusicPlaylist } from "../types/music";
import PlaylistTracks from "../components/PlaylistTracks";

/**
 * Liste privée et opérations serveur injectées par useLibrary ; les mutations renvoient leurs
 * confirmations.
 */
type Props = {
  /** Playlists privées confirmées du compte courant. */
  playlists: MusicPlaylist[];
  /** Indique une lecture encore en cours pour cet écran. */
  loading: boolean;
  /**
   * Erreur à rendre visible pour ce résultat ; son absence représente un résultat sans erreur
   * enregistrée.
   */
  error?: string;
  /** Panne de relecture : conserve les listes et le formulaire ouvert. */
  refreshError?: string;
  /** Demande une nouvelle lecture après une erreur ou une actualisation. */
  onRetry: () => void;
  /** Crée côté serveur et renvoie la playlist confirmée. */
  onCreate: (
    name: string,
    description: string,
    visibility: MusicPlaylist["visibility"],
  ) => Promise<MusicPlaylist>;
  /** Retire uniquement l’occurrence identifiée dans la playlist. */
  onRemoveItem: (
    playlist: MusicPlaylist,
    itemId: string,
  ) => Promise<MusicPlaylist>;
  /** Enregistre les champs et renvoie la playlist avec sa nouvelle version. */
  onUpdate: (
    playlist: MusicPlaylist,
    name: string,
    description: string,
    visibility: MusicPlaylist["visibility"],
  ) => Promise<MusicPlaylist>;
  /** Supprime côté serveur ; sa résolution confirme la suppression. */
  onDelete: (playlist: MusicPlaylist) => Promise<void>;
};

/**
 * Conserve les champs saisis et les erreurs pendant une modification ; ferme le formulaire uniquement
 * après confirmation.
 */
function PlaylistEditor({
  playlist,
  onUpdate,
  onClose,
}: {
  /** Playlist confirmée contenant la version connue du client. */
  playlist: MusicPlaylist;
  /** Enregistre les champs et renvoie la playlist avec sa nouvelle version. */
  onUpdate: Props["onUpdate"];
  /** Demande la fermeture de l’écran ou du composant concerné. */
  onClose: () => void;
}) {
  useLanguage();
  const [base, setBase] = useState(playlist);
  const [visibility, setVisibility] = useState(playlist.visibility);
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /**
   * Envoie nom et description nettoyés à onUpdate ; empêche les doubles soumissions et garde le
   * formulaire ouvert en cas de refus.
   */
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || name.trim() === "") return;
    if (base.version !== playlist.version) {
      setBase(playlist);
      setError(
        "The playlist changed. Your inputs are preserved. Review them before saving again.",
      );
      return;
    }
    if (
      visibility !== base.visibility &&
      !window.confirm(
        t("Make this playlist {0}? {1}", {
          "0": translateState(visibility),
          "1": t(
            visibility === "public"
              ? "Anyone with its link can view it."
              : "Its public link will no longer show its contents.",
          ),
        }),
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      await onUpdate(base, name.trim(), description.trim(), visibility);
      onClose();
    } catch (error) {
      if (error instanceof LibraryMutationError && error.playlist)
        setBase(error.playlist);
      setError(
        error instanceof Error ? error.message : "Unable to save playlist.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="playlist-edit-form"
      onSubmit={submit}
      aria-label={t("Edit playlist")}
    >
      <label>
        {" "}
        {t("Name")}{" "}
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
          required
        />
      </label>
      <label>
        {" "}
        {t("Description")}{" "}
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={saving}
        />
      </label>
      <label>
        {" "}
        {t("Visibility")}{" "}
        <select
          aria-label={t("Visibility")}
          value={visibility}
          onChange={(event) =>
            setVisibility(event.target.value as MusicPlaylist["visibility"])
          }
          disabled={saving}
        >
          <option value="private">{t("Private")}</option>
          <option value="public">{t("Public")}</option>
        </select>
      </label>
      <button type="submit" disabled={saving || name.trim() === ""}>
        {saving ? t("Saving…") : t("Save changes")}
      </button>
      <button type="button" disabled={saving} onClick={onClose}>
        {" "}
        {t("Cancel edit")}{" "}
      </button>
      {error && <p role="alert">{translateError(error)}</p>}
    </form>
  );
}

/**
 * Affiche les playlists confirmées du compte et pilote création, édition, suppression et occurrences,
 * avec erreurs conservées dans l’écran.
 */
export default function PlaylistsPage({
  playlists,
  loading,
  error,
  refreshError,
  onRetry,
  onCreate,
  onRemoveItem,
  onUpdate,
  onDelete,
}: Props) {
  useLanguage();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MusicPlaylist | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<{
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string;
    /** Message de suivi ou demande à transmettre, selon le contrat contenant ce champ. */
    message: string;
  } | null>(null);
  const [visibility, setVisibility] =
    useState<MusicPlaylist["visibility"]>("private");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const selected =
    playlists.find((playlist) => playlist.id === selectedId) ?? playlists[0];
  /**
   * Demande une confirmation utilisateur puis attend la suppression serveur avant de retirer les
   * sélections et le formulaire associés.
   */
  async function handleDelete(playlist: MusicPlaylist) {
    if (
      deleting ||
      !window.confirm(t('Delete playlist "{0}"?', { "0": playlist.name }))
    )
      return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(playlist);
      setSelectedId((id) => (id === playlist.id ? null : id));
      setEditing((item) => (item?.id === playlist.id ? null : item));
    } catch (error) {
      setDeleteError({
        id: playlist.id,
        message:
          error instanceof Error ? error.message : "Unable to delete playlist.",
      });
    } finally {
      setDeleting(false);
    }
  }
  /**
   * Crée une playlist côté serveur, sélectionne sa confirmation et vide le formulaire seulement après
   * succès.
   */
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || name.trim() === "") return;
    setCreating(true);
    setCreateError("");
    try {
      const playlist = await onCreate(
        name.trim(),
        description.trim(),
        visibility,
      );
      setSelectedId(playlist.id);
      setName("");
      setDescription("");
      setVisibility("private");
      setNotice("Playlist created.");
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Unable to create playlist.",
      );
    } finally {
      setCreating(false);
    }
  }
  return (
    <main className="playlists-page">
      <header>
        <p className="page-label">{t("Your library")}</p>
        <h1>{t("Playlists")}</h1>
        <p>{t("Create your own collections and choose who can see them.")}</p>
      </header>
      {notice && <p role="status">{translateError(notice)}</p>}
      <section
        className="playlist-section"
        aria-labelledby="create-playlist-title"
      >
        <h2 id="create-playlist-title">{t("Create a playlist")}</h2>
        <form className="playlist-form" onSubmit={handleSubmit}>
          <label>
            {" "}
            {t("Name")}{" "}
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              disabled={creating}
            />
          </label>
          <label>
            {" "}
            {t("Description")}{" "}
            <input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={creating}
            />
          </label>
          <label>
            {" "}
            {t("Visibility")}{" "}
            <select
              aria-label={t("Visibility")}
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as MusicPlaylist["visibility"])
              }
              disabled={creating}
            >
              <option value="private">{t("Private")}</option>
              <option value="public">{t("Public")}</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={creating || loading || !!error || name.trim() === ""}
          >
            {creating ? t("Creating…") : t("Create playlist")}
          </button>
          {createError && <p role="alert">{translateError(createError)}</p>}
        </form>
      </section>
      <section
        className="playlist-section"
        aria-labelledby="my-playlists-title"
      >
        <h2 id="my-playlists-title">{t("My playlists")}</h2>
        {loading ? (
          <p role="status">{t("Loading playlists…")}</p>
        ) : error ? (
          <div role="alert">
            <p>{translateError(error)}</p>
            <button type="button" onClick={onRetry}>
              {" "}
              {t("Retry playlists")}{" "}
            </button>
          </div>
        ) : (
          <>
            {playlists.length === 0 && <p>{t("No playlists yet.")}</p>}
            <div className="playlist-list">
              {playlists.map((playlist) => (
                <button
                  type="button"
                  key={playlist.id}
                  className={
                    playlist.id === selected?.id
                      ? "playlist-card active"
                      : "playlist-card"
                  }
                  onClick={() => {
                    setSelectedId(playlist.id);
                    setEditing(null);
                  }}
                >
                  <strong>{playlist.name}</strong>
                  <span>{playlist.description || t("No description")}</span>
                  <span>
                    {translateState(playlist.visibility)} ·{" "}
                    {translateCount(playlist.items.length, "track")}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      {!loading && !error && selected && (
        <section
          className="playlist-section"
          aria-labelledby="playlist-tracks-title"
        >
          <div className="playlist-heading">
            <h2 id="playlist-tracks-title">
              {t("Tracks in")} {selected.name}
            </h2>
            <div className="playlist-heading-actions">
              {selected.visibility === "public" && (
                <button onClick={() => openMusic("playlists", selected.id)}>
                  {" "}
                  {t("Open public link")}{" "}
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(selected)}
                disabled={editing?.id === selected.id || deleting}
              >
                {" "}
                {t("Edit playlist")}{" "}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  void handleDelete(selected);
                }}
              >
                {deleting ? t("Deleting…") : t("Delete playlist")}
              </button>
            </div>
          </div>
          {deleteError?.id === selected.id && (
            <p role="alert">{translateError(deleteError.message)}</p>
          )}
          <PlaylistTracks
            key={`tracks:${selected.id}`}
            playlist={selected}
            onRemove={onRemoveItem}
          />
        </section>
      )}
      {editing && (
        <PlaylistEditor
          key={`editor:${editing.id}`}
          playlist={playlists.find((item) => item.id === editing.id) ?? editing}
          onUpdate={async (...args) => {
            const confirmed = await onUpdate(...args);
            setNotice(`Playlist saved · ${confirmed.visibility}.`);
            return confirmed;
          }}
          onClose={() => setEditing(null)}
        />
      )}
      <RefreshNotice error={refreshError} retry={onRetry} />
    </main>
  );
}
