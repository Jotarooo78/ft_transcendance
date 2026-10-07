import { useEffect, useState } from "react";
import { getPlaylists } from "../services/library";
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
  return { playlists: current ? result.items : [], loading: ownerId !== null && !current,
    error: current ? result.error : undefined, reload: () => setRetry(value => value + 1) };
}
