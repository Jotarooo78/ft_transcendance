/** Projets musicaux échangés avec Catalogue. */
import type { Track } from "./music";
/** Type choisi à la création ; compilation reste lisible pour les anciennes données. */
export type ProjectType = "single" | "album" | "mixtape" | "ep";
/** Profil public actuel du compte artiste. */
export type MusicArtist = {
  /** Présentation publique disponible sur le détail artiste. */ bio?:
    string | null;
  /** Identité stable du compte. */ userId: string;
  /** Nom public modifiable. */ displayName: string;
  /** Nom unique du compte. */ username: string;
  /** Image publique facultative. */ avatarUrl: string | null;
};
/** Projet confirmé ; les brouillons ont des pistes sans URL audio publique. */
export type MusicProject = {
  /** Identité conservée lors des reprises. */ id: string;
  /** Titre et présentation libre. */ title: string;
  /** Texte libre, éventuellement vide. */ description: string;
  /** Type de sortie. */ releaseType: ProjectType | "compilation";
  /** Visibilité de publication, distincte de la visibilité des playlists. */ status:
    "draft" | "published";
  /** Version attendue à la prochaine sauvegarde. */ version: number;
  /** Compte propriétaire, absent des projets historiques. */ ownerUserId:
    string | null;
  /** Identité publique du propriétaire. */ artist: MusicArtist | null;
  /** Date automatique de première publication, YYYY-MM-DD. */ releaseDate:
    string | null;
  /** Audio portant la pochette commune. */ coverAssetId: string | null;
  /** Adresse publique de la pochette, absente avant publication. */ coverUrl:
    string | null;
  /** Morceaux ordonnés. */ tracks: Track[];
};
/** Corps de sauvegarde sans identité de propriétaire fournie par le navigateur. */
export type ProjectInput = {
  /** Nom prérempli et modifiable. */ title: string;
  /** Présentation facultative. */ description: string;
  /** Type explicitement choisi. */ releaseType: ProjectType;
  /** Audio du projet dont on utilise la pochette, ou null. */ coverAssetId:
    string | null;
  /** Version zéro pour une nouvelle création. */ expectedVersion: number;
  /** Fichiers prêts et titres, dans l’ordre voulu. */ tracks: {
    audioAssetId: string;
    title: string;
  }[];
};
/** Page issue du serveur ; le total concerne toute la recherche. */
export type MusicPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
