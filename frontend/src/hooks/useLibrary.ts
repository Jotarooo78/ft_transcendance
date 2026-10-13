/** État React des playlists du compte ; les réponses anciennes et les changements de session ne doivent pas réintroduire des données privées. */
import { useEffect, useState } from "react";
import { addPlaylistItem, createPlaylist, deletePlaylist, getPlaylist, getPlaylists, LibraryMutationError, removePlaylistItem, updatePlaylist } from "../services/library";
import { getAccessToken, onSessionCleared } from "../services/session";
import type { PrivatePlaylist } from "../types/music";

/**
 * Charge les playlists du propriétaire, expose les opérations confirmées et efface l’état privé quand
 * la session est perdue. Un conflit 409 déclenche une relecture sans rejouer automatiquement l’action.
 */
export function useLibrary(ownerId: string | null) {
  const [retry, setRetry] = useState(0);
  const token = getAccessToken();
  const key = JSON.stringify([ownerId, token, retry]);
  const [result, setResult] = useState<{
    /** Identité de la requête ou de l’état ; empêche d’afficher une réponse devenue périmée. */
    key: string;
    /** Éléments de la page ou occurrences de playlist ; le total peut dépasser cette liste. */
    items: PrivatePlaylist[];
    /** Erreur à rendre visible pour ce résultat ; son absence représente un résultat sans erreur enregistrée. */
    error?: string }>({ key: "", items: [] });
  useEffect(() => onSessionCleared(() => setResult({ key: "", items: [] })), []);
  useEffect(() => {
    if (!ownerId || !token) return;
    const controller = new AbortController();
    void getPlaylists(controller.signal).then(items => {
      if (!controller.signal.aborted && token === getAccessToken()) setResult({ key, items });
    }).catch(error => {
      if (!controller.signal.aborted && token === getAccessToken()) setResult({ key, items: [],
        error: error instanceof Error ? error.message : "Unable to load playlists." });
    });
    return () => controller.abort();
  }, [ownerId, token, key]);
  const current = ownerId !== null && result.key === key;
  /** Refuse une opération si le token courant n’est plus celui capturé par ce hook. */
  function requireCurrentAccount() {
    if (!token || token !== getAccessToken()) throw new Error("The signed-in account changed.");
  }
  /**
   * Crée côté serveur puis ajoute la confirmation à la liste seulement si le compte est toujours
   * courant.
   */
  async function create(name: string, description: string) {
    requireCurrentAccount();
    const playlist = await createPlaylist(name, description);
    requireCurrentAccount();
    setResult(previous => previous.key === key ? { ...previous, items: [playlist, ...previous.items] } : previous);
    return playlist;
  }
  /** Remplace une playlist avec une version confirmée au moins aussi récente que l’état affiché. */
  function replace(playlist: PrivatePlaylist) {
    requireCurrentAccount();
    setResult(previous => previous.key === key ? { ...previous,
      items: previous.items.map(item => item.id === playlist.id && item.version <= playlist.version ? playlist : item) } : previous);
  }
  /**
   * Exécute l’opération et applique sa confirmation. Sur 409, relit la playlist pour informer
   * l’utilisateur ; ne rejoue pas sa modification.
   */
  async function mutate<T extends PrivatePlaylist | void>(playlist: PrivatePlaylist, operation: () => Promise<T>) {
    requireCurrentAccount();
    try {
      const confirmed = await operation();
      requireCurrentAccount();
      if (confirmed) replace(confirmed);
      return confirmed;
    } catch (error) {
      requireCurrentAccount();
      if (error instanceof LibraryMutationError && error.status === 409) {
        try { replace(await getPlaylist(playlist.id)); }
        catch { throw new Error("The playlist changed. Your action was not applied. Refresh playlists before trying again."); }
        throw new Error("The playlist changed and has been refreshed. Your action was not applied. Review it before trying again.", { cause: error });
      }
      throw error;
    }
  }
  /** Retire la playlist de l’état uniquement après la confirmation serveur et la vérification du compte. */
  async function remove(playlist: PrivatePlaylist) {
    await mutate(playlist, () => deletePlaylist(playlist));
    requireCurrentAccount();
    setResult(previous => previous.key === key ? { ...previous, items: previous.items.filter(item => item.id !== playlist.id) } : previous);
  }
  return { playlists: current ? result.items : [], loading: ownerId !== null && !current,
    error: current ? result.error : undefined,
      /** Invalide la clé de lecture pour demander une nouvelle liste au serveur. */
      reload: () => setRetry(value => value + 1), create, remove,
    /** Ajoute un morceau via la mutation versionnée puis applique la playlist confirmée. */
    addItem: (playlist: PrivatePlaylist, trackId: string) => mutate(playlist, () => addPlaylistItem(playlist, trackId)),
    /** Enregistre les champs via la mutation versionnée puis applique la confirmation. */
    update: (playlist: PrivatePlaylist, name: string, description: string) => mutate(playlist, () => updatePlaylist(playlist, name, description)),
    /** Retire une occurrence via sa propre identité et la version de playlist. */
    removeItem: (playlist: PrivatePlaylist, itemId: string) => mutate(playlist, () => removePlaylistItem(playlist, itemId)) };
}
