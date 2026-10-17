import { useCallback } from "react";
import { useResource } from "./useResource";
import { readTrackDetails } from "../services/track-details";
/** Charge chaque titre distinct une fois, tout en laissant l'écran conserver les occurrences répétées. */
export function useTrackDetails(trackIds: string[]) {
  const ids = JSON.stringify([...new Set(trackIds)].sort());
  return useResource(
    useCallback(
      async (signal) => {
        const unique: string[] = JSON.parse(ids);
        return readTrackDetails(unique, signal, true);
      },
      [ids],
    ),
  );
}
