/** Contrat du lecteur commun aux pages musicales. */
import { createContext, useContext } from "react";
import type { Track } from "../types/music";
import type { MusicQueue, QueueEntry } from "../services/music-queue";
/** Contexte de sélection ; les identités gardent les doublons des playlists distincts. */
export type PlayOptions = {
  /** Index dans la liste complète. */ index?: number;
  /** Identités des occurrences parallèles aux morceaux. */ ids?: string[];
  /** Origine affichée dans la file. */ source?: string;
  /** Force le mélange pour le bouton de lecture aléatoire. */ shuffle?: boolean;
  /** Relance la sélection même lorsque son premier titre est courant. */ restart?: boolean;
};
/** La file appartient à la session de navigation, pas à une page particulière. */
export type MusicPlayer = {
  /** Lance un morceau et conserve les suivants dans leur ordre. */ play: (
    track: Track,
    queue?: Track[],
    options?: PlayOptions,
  ) => void;
  /** Identité du morceau courant, ou aucune lecture. */ currentId:
    string | null;
  /** Occurrence d’origine pour distinguer les doublons dans une liste. */ currentOccurrence:
    string | null;
  /** État confirmé par l’élément audio. */ playing: boolean;
  /** Audio en chargement ou en attente de données. */ loading: boolean;
  /** Volume entre zéro et un. */ volume: number;
  /** Son coupé indépendamment du volume. */ muted: boolean;
  /** État complet de la file. */ queue: MusicQueue;
  /** Occurrence sélectionnée. */ current?: QueueEntry;
  /** Message de panne ou de reprise. */ notice: string;
  /** Ouvre ou ferme la file visible. */ queueOpen: boolean;
  /** Bascule la lecture réelle. */ toggle: () => void;
  /** Passe au suivant manuellement. */ next: () => void;
  /** Recommence après trois secondes, sinon revient en arrière. */ previous: () => void;
  /** Déplace la lecture en secondes. */ seek: (seconds: number) => void;
  /** Modifie le volume. */ setVolume: (volume: number) => void;
  /** Bascule la sourdine. */ toggleMute: () => void;
  /** Change le mélange des prochains titres. */ shuffle: () => void;
  /** Passe au mode de répétition suivant. */ repeat: () => void;
  /** Ajoute une occurrence après la courante ou en fin de file. */ add: (
    track: Track,
    next: boolean,
  ) => void;
  /** Retire uniquement la place demandée. */ remove: (key: string) => void;
  /** Lance une place de la file courante. */ jump: (key: string) => void;
  /** Modifie l’ouverture du panneau. */ showQueue: (open: boolean) => void;
  /** Réessaie l’audio après une panne. */ retry: () => void;
  /** Arrête la lecture et vide la file. */ close: () => void;
};
/** Contexte séparé du composant pour conserver le rechargement des composants React. */
export const MusicPlayerContext = createContext<MusicPlayer | null>(null);
/** Exige un parent lecteur dans les écrans musicaux. */
export function useMusicPlayer() {
  const value = useContext(MusicPlayerContext);
  if (!value) throw new Error("Music player is missing");
  return value;
}
