/** Contrats internes du stockage, de la lecture et de la suppression ; la réponse publique exclut chemins et propriétaire. */
import type { ValidatedFile } from "./validate-file.js";

/** Métadonnées privées de l’original, avec tailles et durée bigint provenant de PostgreSQL. */
export type StoredFile = {
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
    /** UUID du compte ayant envoyé l’original ; null pour les fichiers sans propriétaire utilisateur. */
    uploaderUserId: string | null;
    /** Usage interne Media ; la gestion privée reçoit uniquement des audios et associe les images comme variantes. */
    purpose: string;
    /** État de stockage Media : ready pour l’accès, deleting pendant la suppression, deleted après confirmation. */
    state: string;
  /** Nom interne du fichier sur le volume durable ; ne doit pas être exposé au client. */
  storageKey: string;
    /** Type MIME du contenu vérifié, utilisé pour servir les octets avec leur format. */
    mimeType: string;
    /** Taille exacte de l’original ou de la variante en octets, pas en mégaoctets. */
    byteSize: bigint | null;
    /** Durée en millisecondes ; null lorsque cette durée n’est pas disponible ou ne s’applique pas. */
    durationMs: bigint | null;
  /**
   * Empreinte SHA-256 de l’original ; sert à contrôler l’identité des octets, pas à partager le
   * stockage.
   */
  checksumSha256: string | null;
  /** Représentations chargées avec l’audio, utilisées pour exposer sa pochette facultative. */
  variants?: FileVariant[];
};
/** Métadonnées d’une représentation dérivée, par exemple l’aperçu MP3, conservée sous sa propre clé. */
export type FileVariant = {
  /** Identifiant public de cette représentation, utile pour renouveler un aperçu remplacé. */
  id?: string;
  /** private-preview pour l’audio, cover pour la pochette, retired-cover-* pour les traces à nettoyer. */
  renditionKey?: string;
  /** Nom interne du fichier sur le volume durable ; ne doit pas être exposé au client. */
  storageKey: string;
  /** Type MIME du contenu vérifié, utilisé pour servir les octets avec leur format. */
  mimeType: string;
  /** Taille exacte de l’original ou de la variante en octets, pas en mégaoctets. */
  byteSize: bigint };
/**
 * Écriture SQL de l’original et de l’aperçu ; contrôle de clé utilisé lors de la récupération des
 * uploads.
 */
export type FileStore = {
  /** Création atomique des métadonnées de l’original et de son aperçu. */
  create: (id: string, owner: string, file: ValidatedFile, storageKey: string, previewKey?: string, expiresAt?: Date) => Promise<StoredFile>;
  /** Contrôle d’une confirmation SQL avant nettoyage des fichiers temporaires. */
  hasStorageKey: (key: string) => Promise<boolean>;
};
/**
 * Liste bornée au compte et lecture par propriétaire ; une absence et un accès étranger sont tous deux
 * représentés par null.
 */
export type FileReader = {
  /** Liste paginée des fichiers ready de ce propriétaire. */
  list: (owner: string, page: number, pageSize: number) => Promise<{
    /** Éléments de la page ou occurrences de playlist ; le total peut dépasser cette liste. */
    items: StoredFile[];
    /** Nombre total d’éléments correspondant au filtre, avant la pagination. */
    total: number }>;
  /** Lecture SQL filtrée par propriétaire ; une absence reste null. */
  read: (request: {
    /** UUID provenant du JWT vérifié, jamais du corps fourni par le client. */
    authenticatedUserId?: string }, id: string) => Promise<(StoredFile & {
    /** Représentations dérivées de l’original, avec leur propre clé de stockage. */
    variants: FileVariant[] }) | null>;
};
/**
 * Opérations nécessaires à la suppression reprenable, avec contrôle des références et transitions
 * scoped au propriétaire.
 */
export type FileDeletion = {
  /** Lecture SQL filtrée par propriétaire ; une absence reste null. */
  read: FileReader["read"];
  /** Transition conditionnelle ready vers deleting pour ce propriétaire. */
  markDeleting: (id: string, owner: string) => Promise<boolean>;
  /** Confirmation SQL de la suppression du fichier deleting. */
  markDeleted: (id: string, owner: string) => Promise<void>;
  /** Lecture bornée des fichiers deleting à reprendre avant le démarrage. */
  pending: (maximum: number) => Promise<Array<StoredFile>>;
  /** Contrôle des références Catalogue ; une panne bloque la suppression. */
  referenced: (id: string) => Promise<boolean>;
};
/**
 * Sélectionne les seuls champs publics et traduit cover en usage image. Les tailles viennent de
 * fichiers déjà validés ; aucun chemin, propriétaire ou checksum n’est renvoyé.
 */
export function publicFile(file: StoredFile) {
  const cover = file.variants?.find(variant => variant.renditionKey === "cover");
  return { id: file.id, usage: file.purpose === "audio" ? "audio" : "image", state: file.state,
    mimeType: file.mimeType, byteSize: Number(file.byteSize), durationMs: file.durationMs === null ? null : Number(file.durationMs),
    cover: cover ? publicCover(cover) : null };
}

/** Métadonnées minimales d’une pochette ; ses octets exigent un nouvel accès privé par l’audio. */
export function publicCover(cover: FileVariant) { return { id: cover.id, mimeType: cover.mimeType, byteSize: Number(cover.byteSize) }; }
