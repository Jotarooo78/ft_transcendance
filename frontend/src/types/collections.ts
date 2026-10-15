/** Actions indépendantes conservées dans la bibliothèque du compte. */
export type CollectionKind = "track" | "project" | "artist" | "playlist";
/** Référence personnelle, sans copier les données publiques de sa cible. */
export type SavedReference = {
  /** Identité publique de la cible, sans son contenu. */ id: string;
  /** Instant ISO de l'ajout personnel. */ createdAt: string;
};
/** Sections personnelles, distinctes des publications et des playlists possédées. */
export type Collections = Record<CollectionKind, SavedReference[]>;
