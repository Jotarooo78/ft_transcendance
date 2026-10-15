/** État React des playlists du compte ; les réponses anciennes et les changements de session ne doivent pas réintroduire des données privées. */
import { useCallback } from "react";
import { useResource } from "./useResource";
import {
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  LibraryMutationError,
  removePlaylistItem,
  updatePlaylist,
} from "../services/library";
import { getAccessToken } from "../services/session";
import type { MusicPlaylist } from "../types/music";

/**
 * Charge les playlists du propriétaire, expose les opérations confirmées et efface l’état privé quand
 * la session est perdue. Un conflit 409 déclenche une relecture sans rejouer automatiquement l’action.
 */
export function useLibrary(ownerId: string | null, visible = true) {
  const token = getAccessToken();
  const resource = useResource(
    useCallback(
      async (signal) => {
        if (!ownerId || !token) return [];
        const items = await getPlaylists(signal);
        if (token !== getAccessToken())
          throw new Error("The signed-in account changed.");
        return items;
      },
      [ownerId, token],
    ),
    !!ownerId && visible,
  );
  /** Refuse une opération si le token courant n’est plus celui capturé par ce hook. */
  function requireCurrentAccount() {
    if (!token || token !== getAccessToken())
      throw new Error("The signed-in account changed.");
  }
  /**
   * Crée côté serveur puis ajoute la confirmation à la liste seulement si le compte est toujours
   * courant.
   */
  async function create(
    name: string,
    description: string,
    visibility: MusicPlaylist["visibility"] = "private",
  ) {
    requireCurrentAccount();
    const resume = resource.pause();
    try {
      const playlist = await createPlaylist(name, description, visibility);
      requireCurrentAccount();
      resource.update((items) => [playlist, ...(items ?? [])]);
      return playlist;
    } finally {
      resume();
    }
  }
  /** Remplace une playlist uniquement par une confirmation de version au moins aussi récente. */
  function replace(playlist: MusicPlaylist) {
    requireCurrentAccount();
    resource.update((items) =>
      (items ?? []).map((item) =>
        item.id === playlist.id && item.version <= playlist.version
          ? playlist
          : item,
      ),
    );
  }
  /**
   * Exécute l’opération et applique sa confirmation. Sur 409, relit la playlist pour informer
   * l’utilisateur ; ne rejoue pas sa modification.
   */
  async function mutate<T extends MusicPlaylist | void>(
    playlist: MusicPlaylist,
    operation: () => Promise<T>,
  ) {
    requireCurrentAccount();
    const resume = resource.pause();
    try {
      const confirmed = await operation();
      requireCurrentAccount();
      if (confirmed) replace(confirmed);
      return confirmed;
    } catch (error) {
      requireCurrentAccount();
      if (error instanceof LibraryMutationError && error.status === 409) {
        let latest: MusicPlaylist;
        try {
          latest = await getPlaylist(playlist.id);
          replace(latest);
        } catch {
          throw new Error(
            "The playlist changed. Your action was not applied. Wait for the automatic update or retry when it becomes available.",
          );
        }
        throw new LibraryMutationError(
          409,
          "The playlist changed and has been refreshed. Your action was not applied. Review it before trying again.",
          latest,
        );
      }
      throw error;
    } finally {
      resume();
    }
  }
  /** Retire la playlist de l’état uniquement après la confirmation serveur et la vérification du compte. */
  async function remove(playlist: MusicPlaylist) {
    await mutate(playlist, () => deletePlaylist(playlist));
    requireCurrentAccount();
    resource.update((items) =>
      (items ?? []).filter((item) => item.id !== playlist.id),
    );
  }
  return {
    playlists: ownerId ? (resource.data ?? []) : [],
    loading: ownerId !== null && resource.loading,
    error: resource.error,
    refreshError: resource.refreshError,
    reload: resource.reload,
    create,
    remove,
    /** Ajoute un morceau via la mutation versionnée puis applique la playlist confirmée. */
    addItem: (playlist: MusicPlaylist, trackId: string) =>
      mutate(playlist, () => addPlaylistItem(playlist, trackId)),
    /** Enregistre les champs via la mutation versionnée puis applique la confirmation. */
    update: (
      playlist: MusicPlaylist,
      name: string,
      description: string,
      visibility: MusicPlaylist["visibility"] = playlist.visibility,
    ) =>
      mutate(playlist, () =>
        updatePlaylist(playlist, name, description, visibility),
      ),
    /** Retire une occurrence via sa propre identité et la version de playlist. */
    removeItem: (playlist: MusicPlaylist, itemId: string) =>
      mutate(playlist, () => removePlaylistItem(playlist, itemId)),
  };
}
