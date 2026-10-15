/** Contrat du lecteur commun aux pages musicales. */
import { createContext, useContext } from "react";
import type { Track } from "../types/music";
/** La file appartient à la session de navigation, pas à une page particulière. */
export type MusicPlayer = {
  /** Lance un morceau et conserve les suivants dans leur ordre. */ play: (
    track: Track,
    queue?: Track[],
  ) => void;
  /** Identité du morceau courant, ou aucune lecture. */ currentId:
    string | null;
};
/** Contexte séparé du composant pour conserver le rechargement des composants React. */
export const MusicPlayerContext = createContext<MusicPlayer | null>(null);
/** Exige un parent lecteur dans les écrans musicaux. */
export function useMusicPlayer() {
  const value = useContext(MusicPlayerContext);
  if (!value) throw new Error("Music player is missing");
  return value;
}
