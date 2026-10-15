export type Track = {
  /** Projet publié auquel appartient ce titre. */
  projectId?: string | null;
  id: string;
  title: string;
  artistName: string;
  /** Compte artiste stable ; absent sur les morceaux historiques de démonstration. */
  artistUserId?: string | null;
  /** Avatar actuel du compte. */
  artistAvatarUrl?: string | null;
  /** Présentation libre enregistrée avec le morceau. */
  description?: string | null;
  /** Route de la pochette publique ; son absence utilise le visuel par défaut. */
  coverUrl?: string | null;
  albumTitle: string;
  genre: string;
  /** Durée en secondes pour l’affichage ; null représente une durée inconnue. */
  durationSeconds: number | null;
  /** Durée en millisecondes ; null lorsque cette durée n’est pas disponible ou ne s’applique pas. */
  durationMs?: number | null;
  /** UUID du fichier Media lié au morceau ; null si aucun audio n’est associé. */
  audioAssetId?: string | null;
  /** Route relative de lecture Media ; null si le morceau ne possède pas d’audio. */
  audioUrl: string | null;
  /** Type MIME du contenu vérifié, utilisé pour servir les octets avec leur format. */
  mimeType?: string;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
};

// Server representation; the legacy Playlist type remains for unused local files.
/**
 * Occurrence indépendante : le même trackId peut apparaître plusieurs fois avec des id et positions
 * différents.
 */
export type PlaylistItem = {
  /** Date ISO de cette occurrence, indépendante de la publication du morceau. */
  addedAt?: string;
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** UUID du morceau Catalogue, distinct de l’occurrence de playlist ou de la session. */
  trackId: string;
  /** Ordre d’une occurrence dans la playlist ; les trous après suppression sont conservés. */
  position: number;
};
/**
 * Playlist persistante du compte ou projection publique, avec version de concurrence et occurrences renvoyées par
 * Library.
 */
export type MusicPlaylist = {
  /** Identité publique du créateur ; absente seulement sur les anciennes réponses. */
  ownerUserId?: string;
  /** Dates ISO utilisées par les tris de la bibliothèque. */
  createdAt?: string;
  updatedAt?: string;
  /** Image Media privée ou publique selon la playlist. */
  coverAssetId?: string | null;
  /** Visibilité actuelle ; privé reste la valeur initiale. */
  visibility: "private" | "public";
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** Nom de la playlist ou libellé lu par cette projection. */
  name: string;
  /** Description de playlist ; le contrat client représente son absence par une chaîne vide. */
  description: string;
  /** Version de concurrence de la playlist ; une mutation réussie l’incrémente. */
  version: number;
  /** Éléments de la page ou occurrences de playlist ; le total peut dépasser cette liste. */
  items: PlaylistItem[];
};
