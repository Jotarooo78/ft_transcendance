/** Progression rapide réservée à la barre : les listes ne se réaffichent pas à chaque timeupdate audio. */
import { createContext, useContext, useSyncExternalStore } from "react";
/** Valeurs en secondes confirmées par le moteur, indépendantes du temps d’écoute crédité. */
type PlaybackProgress = {
  /** Position courante, éventuellement déplacée par l’utilisateur. */ position: number;
  /** Durée réelle connue ; zéro avant réception des métadonnées. */ duration: number;
};
/** Crée un état observable propre au lecteur du compte, sans état global partagé entre comptes. */
export function createPlaybackProgress() {
  let snapshot: PlaybackProgress = { position: 0, duration: 0 };
  const listeners = new Set<() => void>();
  return {
    /** Retourne la même référence jusqu’à un changement réel, comme l’exige useSyncExternalStore. */
    read: () => snapshot,
    /** Abonne seulement les composants qui affichent le temps ; le nettoyage détache leur écoute. */
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Publie une nouvelle mesure sans redessiner les pages abonnées aux seules commandes de lecture. */
    update: (position: number, duration = snapshot.duration) => {
      if (snapshot.position === position && snapshot.duration === duration)
        return;
      snapshot = { position, duration };
      for (const listener of listeners) listener();
    },
  };
}
/** Instance stable fournie par MusicPlayerProvider et isolée à chaque connexion. */
export const PlaybackProgressContext = createContext<ReturnType<
  typeof createPlaybackProgress
> | null>(null);
/** Abonne la barre à la progression réelle, sans diffuser cette horloge aux lignes musicales. */
export function usePlaybackProgress() {
  const progress = useContext(PlaybackProgressContext);
  if (!progress) throw new Error("Playback progress is missing");
  return useSyncExternalStore(progress.subscribe, progress.read, progress.read);
}
