/** Contrat des playlists privées : une occurrence identifie une ligne, même lorsque le même morceau apparaît plusieurs fois. */
/** Reconnaît le format UUID accepté par ce contrat avant les lectures ou écritures. */
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Occurrence indépendante d’un morceau dans une playlist ; son id sert à retirer uniquement cette
 * ligne.
 */
export type PlaylistItem = {
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** UUID du morceau Catalogue, distinct de l’occurrence de playlist ou de la session. */
  trackId: string;
  /** Ordre d’une occurrence dans la playlist ; les trous après suppression sont conservés. */
  position: number };
/** Playlist privée avec version de concurrence et occurrences ordonnées. */
export type Playlist = {
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** Nom de la playlist ou libellé lu par cette projection. */
  name: string;
  /** Description de playlist ; le contrat client représente son absence par une chaîne vide. */
  description: string;
  /** Version de concurrence de la playlist ; une mutation réussie l’incrémente. */
  version: number;
  /** Éléments de la page ou occurrences de playlist ; le total peut dépasser cette liste. */
  items: PlaylistItem[] };
/** Pagination positive, à partir de la page 1, avec taille bornée. */
export type PageQuery = {
  /** Numéro de page à partir de 1. */
  page: number;
  /** Nombre maximal d’éléments demandé par page, contrôlé par la route. */
  pageSize: number };
/** Page de playlists du compte et total de ses playlists privées. */
export type PlaylistPage = PageQuery & {
  /** Éléments de la page ou occurrences de playlist ; le total peut dépasser cette liste. */
  items: Playlist[];
  /** Nombre total d’éléments correspondant au filtre, avant la pagination. */
  total: number };
/** Nom et description validés pour la création ou la modification. */
export type PlaylistInput = {
  /** Nom de la playlist ou libellé lu par cette projection. */
  name: string;
  /** Description de playlist ; le contrat client représente son absence par une chaîne vide. */
  description: string };
/**
 * Erreur métier portant un statut HTTP et un code public ; sépare absence, conflit de version et
 * limite atteinte.
 */
export class PlaylistError extends Error {
  /** Associe le statut HTTP et le code public à l’erreur métier. */
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

/**
 * Accepte uniquement expectedVersion, entier sûr positif correspondant à la version lue par le client
 * ; renvoie null sinon.
 */
export function versionInput(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && typeof body.expectedVersion === "number" &&
    Number.isSafeInteger(body.expectedVersion) && body.expectedVersion > 0 ? body.expectedVersion : null;
}

/** Valide l’UUID du morceau et la version attendue avant l’ajout d’une occurrence. */
export function addItemInput(value: unknown): {
  /** UUID du morceau Catalogue, distinct de l’occurrence de playlist ou de la session. */
  trackId: string;
  /** Version que le client a lue ; une différence avec la base produit un conflit 409. */
  expectedVersion: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["trackId", "expectedVersion"].includes(key)) ||
    typeof body.trackId !== "string" || !uuidPattern.test(body.trackId) ||
    typeof body.expectedVersion !== "number" || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) return null;
  return { trackId: body.trackId.toLowerCase(), expectedVersion: body.expectedVersion };
}

/** Valide le nom obligatoire et la description facultative, les nettoie et refuse les champs inconnus. */
export function createInput(value: unknown): PlaylistInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["name", "description"].includes(key)) || typeof body.name !== "string") return null;
  const name = body.name.trim();
  if ([...name].length < 1 || [...name].length > 100) return null;
  if (body.description !== undefined && typeof body.description !== "string") return null;
  const description = (body.description as string | undefined)?.trim() ?? "";
  return [...description].length <= 2000 ? { name, description } : null;
}

/** Valide une modification partielle avec version attendue ; les champs omis restent inchangés. */
export function editInput(value: unknown): {
  /** Champs validés à modifier ; les champs omis restent inchangés. */
  changes: Partial<PlaylistInput>;
  /** Version que le client a lue ; une différence avec la base produit un conflit 409. */
  expectedVersion: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["name", "description", "expectedVersion"].includes(key)) ||
    !("name" in body || "description" in body)) return null;
  const expectedVersion = versionInput({ expectedVersion: body.expectedVersion });
  const fields = createInput({ name: "name" in body ? body.name : "Unchanged", description: body.description });
  if (expectedVersion === null || !fields) return null;
  return { expectedVersion, changes: { ...("name" in body ? { name: fields.name } : {}),
    ...("description" in body ? { description: fields.description } : {}) } };
}

/**
 * Convertit la version bigint en entier JavaScript sûr et normalise une description null en chaîne
 * vide, sans fusionner les occurrences.
 */
export function toPlaylist(row: {
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** Nom de la playlist ou libellé lu par cette projection. */
  name: string;
  /** Description de playlist ; le contrat client représente son absence par une chaîne vide. */
  description: string | null;
  /** Version de concurrence de la playlist ; une mutation réussie l’incrémente. */
  version: bigint;
  /** Éléments de la page ou occurrences de playlist ; le total peut dépasser cette liste. */
  items: PlaylistItem[] }): Playlist {
  if (row.version < 1n || row.version > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Unsupported playlist version");
  return { id: row.id, name: row.name, description: row.description ?? "", version: Number(row.version),
    items: row.items.map(({ id, trackId, position }) => ({ id, trackId, position })) };
}

/**
 * Valide page et pageSize ; applique 1 et 20 par défaut, plafonne la taille à 100 et refuse un
 * décalage non représentable.
 */
export function pageQuery(query: Record<string, unknown>): PageQuery | null {
  if (Object.keys(query).some(key => !["page", "pageSize"].includes(key))) return null;
  /**
   * Lit un entier positif transmis en chaîne, ou sa valeur par défaut ; renvoie NaN pour un paramètre
   * invalide.
   */
  const positive = (value: unknown, fallback: number) => value === undefined ? fallback :
    typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
  const page = positive(query.page, 1), pageSize = positive(query.pageSize, 20);
  return Number.isFinite(page) && Number.isFinite(pageSize) && pageSize <= 100 && Number.isSafeInteger((page - 1) * pageSize)
    ? { page, pageSize } : null;
}
