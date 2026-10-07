import { useEffect, useState } from "react";
import { addPlaylistItem, createPlaylist, getPlaylist, getPlaylists, LibraryMutationError, removePlaylistItem } from "../services/library";
import { getAccessToken, onSessionCleared } from "../services/session";
import type { PrivatePlaylist } from "../types/music";

export function useLibrary(ownerId: string | null) {
  const [retry, setRetry] = useState(0);
  const token = getAccessToken();
  const key = JSON.stringify([ownerId, token, retry]);
  const [result, setResult] = useState<{ key: string; items: PrivatePlaylist[]; error?: string }>({ key: "", items: [] });
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
  function requireCurrentAccount() {
    if (!token || token !== getAccessToken()) throw new Error("The signed-in account changed.");
  }
  async function create(name: string, description: string) {
    requireCurrentAccount();
    const playlist = await createPlaylist(name, description);
    requireCurrentAccount();
    setResult(previous => previous.key === key ? { ...previous, items: [playlist, ...previous.items] } : previous);
    return playlist;
  }
  function replace(playlist: PrivatePlaylist) {
    requireCurrentAccount();
    setResult(previous => previous.key === key ? { ...previous,
      items: previous.items.map(item => item.id === playlist.id && item.version <= playlist.version ? playlist : item) } : previous);
  }
  async function mutate(playlist: PrivatePlaylist, operation: () => Promise<PrivatePlaylist>) {
    requireCurrentAccount();
    try {
      const confirmed = await operation();
      replace(confirmed);
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
  return { playlists: current ? result.items : [], loading: ownerId !== null && !current,
    error: current ? result.error : undefined, reload: () => setRetry(value => value + 1), create,
    addItem: (playlist: PrivatePlaylist, trackId: string) => mutate(playlist, () => addPlaylistItem(playlist, trackId)),
    removeItem: (playlist: PrivatePlaylist, itemId: string) => mutate(playlist, () => removePlaylistItem(playlist, itemId)) };
}
