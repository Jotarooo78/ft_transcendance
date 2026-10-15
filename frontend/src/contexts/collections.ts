import { createContext, useContext } from "react";
import type { Collections, CollectionKind } from "../types/collections";
/** État partagé pour garder les boutons cohérents entre les pages. */
export type CollectionState = {
  /** Références confirmées, absentes pendant la lecture. */
  data?: Collections;
  /** Lecture encore en cours. */
  loading: boolean;
  /** Une mutation personnelle attend sa confirmation. */
  busy: boolean;
  /** Erreur commune de lecture à rendre visible. */
  error?: string;
  /** Panne transitoire conservant les références confirmées. */
  refreshError?: string;
  /** Relit toutes les sections après une modification ou une panne. */
  reload: () => void;
  /** Enregistre ou retire une référence, puis demande sa relecture. */
  change: (kind: CollectionKind, id: string, saved: boolean) => Promise<void>;
};
/** Absent en consultation publique : aucune action privée ne sera affichée. */
export const CollectionsContext = createContext<CollectionState | null>(null);
/** Accède aux références du compte courant. */
export function useCollections() {
  return useContext(CollectionsContext);
}
