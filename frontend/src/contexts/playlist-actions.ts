/** Actions disponibles uniquement dans le contexte bibliothèque. */
import { createContext, useContext } from "react";
import type { Track } from "../types/music";
/** Une sélection garde son ordre avant l’ouverture du sélecteur de playlist. */
export type PlaylistSelection = Pick<Track, "id" | "title">[];
export const PlaylistActionsContext = createContext<
  ((tracks: PlaylistSelection) => void) | null
>(null);
/** Aucun menu d’ajout supplémentaire n’est affiché en dehors du contexte fourni. */
export const usePlaylistActions = () => useContext(PlaylistActionsContext);
