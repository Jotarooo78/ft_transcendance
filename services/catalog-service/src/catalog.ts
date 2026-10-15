/** Contrat public Catalogue, validation des paramètres et conversion des entiers PostgreSQL en valeurs JSON sûres. */
/**
 * Métadonnées publiques d’un morceau publié. Les durées sont en millisecondes et secondes ; une
 * absence d’audio ou de durée reste null.
 */
export type TrackDto = {
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** Titre du morceau publié. */
  title: string;
  /** Nom affiché des artistes crédités, issu de la projection Catalogue. */
  artistName: string;
  /** Compte artiste pour les morceaux publiés par un utilisateur ; absent des anciennes fixtures. */
  artistUserId?: string | null;
  /** Présentation facultative du morceau. */
  description?: string | null;
  /** Titre de la sortie publiée retenue ; peut être vide si aucune ne convient. */
  albumTitle: string;
  /** Genre affiché ou filtre exact du Catalogue ; une chaîne vide n’impose pas de filtre. */
  genre: string;
  /** Durée en millisecondes ; null lorsque cette durée n’est pas disponible ou ne s’applique pas. */
  durationMs: number | null;
  /** Durée en secondes pour l’affichage ; null représente une durée inconnue. */
  durationSeconds: number | null;
  /** UUID du fichier Media lié au morceau ; null si aucun audio n’est associé. */
  audioAssetId: string | null;
  /** Route relative de lecture Media ; null si le morceau ne possède pas d’audio. */
  audioUrl: string | null;
  /** Pochette publique facultative ; un 404 signifie que le visuel par défaut doit être utilisé. */
  coverUrl?: string | null;
  /** Avatar actuel du compte artiste. */
  artistAvatarUrl?: string | null;
};

/**
 * Projection PostgreSQL avant conversion JSON : durationMs reste un bigint pour préserver la
 * précision.
 */
export type TrackRow = {
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** Titre du morceau publié. */
  title: string;
  /** Nom affiché des artistes crédités, issu de la projection Catalogue. */
  artistName: string;
  /** Compte artiste pour les morceaux publiés par un utilisateur ; absent des anciennes fixtures. */
  artistUserId?: string | null;
  /** Présentation facultative du morceau. */
  description?: string | null;
  /** Titre de la sortie publiée retenue ; peut être vide si aucune ne convient. */
  albumTitle: string;
  /** Genre affiché ou filtre exact du Catalogue ; une chaîne vide n’impose pas de filtre. */
  genre: string;
  /** Durée en millisecondes ; null lorsque cette durée n’est pas disponible ou ne s’applique pas. */
  durationMs: bigint | null;
  /** UUID du fichier Media lié au morceau ; null si aucun audio n’est associé. */
  audioAssetId: string | null;
};

/**
 * Convertit une ligne SQL en morceau public et construit sa route audio. Rejette une durée non
 * positive ou impossible à représenter exactement en JavaScript.
 */
export function toTrackDto(row: TrackRow): TrackDto {
  const duration = row.durationMs === null ? null : Number(row.durationMs);
  if (duration !== null && (!Number.isSafeInteger(duration) || duration <= 0)) {
    throw new Error("Unrepresentable track duration");
  }
  return {
    id: row.id, title: row.title, artistName: row.artistName,
    albumTitle: row.albumTitle, genre: row.genre,
    durationMs: duration, durationSeconds: duration === null ? null : duration / 1000,
    ...(row.artistUserId ? { artistUserId: row.artistUserId, description: row.description ?? "", coverUrl: `/api/media/assets/${row.audioAssetId}/artwork` } : {}),
    audioAssetId: row.audioAssetId,
    audioUrl: row.audioAssetId ? `/api/media/assets/${row.audioAssetId}/audio` : null,
  };
}

/** Reconnaît le format UUID accepté par ce contrat avant les lectures ou écritures. */
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pagination à partir de 1, recherche littérale, genre exact et tri global avant découpage de la page. */
export type TrackQuery = {
  /** Numéro de page à partir de 1. */
  page: number;
  /** Nombre maximal d’éléments demandé par page, contrôlé par la route. */
  pageSize: number;
  /** Recherche littérale ; % et _ ne doivent pas devenir des jokers SQL. */
  q: string;
  /** Genre affiché ou filtre exact du Catalogue ; une chaîne vide n’impose pas de filtre. */
  genre: string;
  /** Critère de tri global appliqué avant la pagination. */
  sort: "title" | "artist" | "duration" };
/** Page de morceaux publiée avec son total filtré et la liste des genres disponibles. */
export type TrackList = {
  /** Éléments de la page ou occurrences de playlist ; le total peut dépasser cette liste. */
  items: TrackDto[];
  /** Nombre total d’éléments correspondant au filtre, avant la pagination. */
  total: number;
  /** Numéro de page à partir de 1. */
  page: number;
  /** Nombre maximal d’éléments demandé par page, contrôlé par la route. */
  pageSize: number;
  /** Genres présents parmi les morceaux publiés, disponibles pour le filtre. */
  genres: string[] };

/**
 * Valide les seuls paramètres reconnus ; applique page 1 et taille 20 par défaut, plafonne la taille à
 * 100 et renvoie null pour une entrée invalide.
 */
export function parseTrackQuery(query: Record<string, unknown>): TrackQuery | null {
  if (Object.keys(query).some(key => !["page", "pageSize", "q", "genre", "sort"].includes(key))) return null;
  /**
   * Convertit un paramètre HTTP entier positif, utilise la valeur par défaut s’il est absent et renvoie
   * NaN sinon.
   */
  const integer = (value: unknown, fallback: number): number =>
    value === undefined ? fallback : typeof value === "string" && /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN;
  const page = integer(query.page, 1), pageSize = integer(query.pageSize, 20);
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize) || pageSize > 100 ||
      !Number.isSafeInteger((page - 1) * pageSize)) return null;
  const q = query.q ?? "", genre = query.genre ?? "", sort = query.sort ?? "title";
  if (typeof q !== "string" || q.length > 200 || typeof genre !== "string" || genre.length > 200 ||
      (sort !== "title" && sort !== "artist" && sort !== "duration")) return null;
  return { page, pageSize, q: q.trim(), genre: genre.trim(), sort };
}
