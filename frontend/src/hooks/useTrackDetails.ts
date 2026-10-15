import { useCallback } from "react";
import { useResource } from "./useResource";
import { getTrack } from "../services/catalog";
/** Charge chaque titre distinct une fois, tout en laissant l'écran conserver les occurrences répétées. */
export function useTrackDetails(trackIds: string[]) {
  const ids = JSON.stringify([...new Set(trackIds)].sort());
  return useResource(
    useCallback(
      async (signal) => {
        const unique: string[] = JSON.parse(ids);
        const entries = await Promise.all(
          unique.map(async (id) => {
            try {
              return [id, await getTrack(id, signal)] as const;
            } catch {
              return [id, null] as const;
            }
          }),
        );
        return Object.fromEntries(entries);
      },
      [ids],
    ),
  );
}
