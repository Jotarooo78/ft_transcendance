/** Lecture bornée des métadonnées pour les listes complètes, sans multiplier les requêtes d’un doublon. */
import { getTrack } from "./catalog";
import type { Track } from "../types/music";
/** Charge au plus huit détails simultanément ; conserve une place nulle pour une référence indisponible. */
export async function readTrackDetails(
  ids: string[],
  signal: AbortSignal,
): Promise<Record<string, Track | null>> {
  const unique = [...new Set(ids)],
    result: Record<string, Track | null> = {};
  let index = 0;
  /** Chaque worker prend le prochain identifiant et s’arrête dès l’annulation de la page. */
  async function worker() {
    while (index < unique.length && !signal.aborted) {
      const id = unique[index++];
      try {
        result[id] = await getTrack(id, signal);
      } catch {
        result[id] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, unique.length) }, worker));
  signal.throwIfAborted();
  return result;
}
