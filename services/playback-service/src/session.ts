/** Contrat des sessions d’écoute ; la position dans le morceau reste distincte du temps effectivement crédité. */
/** Reconnaît le format UUID accepté par ce contrat avant les lectures ou écritures. */
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Session publique du compte : durée, position et temps crédité en millisecondes, dates ISO et
 * dernière séquence confirmée.
 */
export type Session = {
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** UUID du morceau Catalogue, distinct de l’occurrence de playlist ou de la session. */
  trackId: string;
  /** Durée du morceau en millisecondes, figée à l’ouverture de la session. */
  trackDurationMs: number;
  /** Date d’ouverture de la session ; format ISO côté client, Date côté stockage. */
  startedAt: string;
  /** Date de clôture ; null tant que la session reste ouverte. */
  endedAt: string | null;
  /** Temps crédité par le serveur en millisecondes, plafonné à la durée du morceau. */
  listenedMs: number;
    /** Dernière séquence de progression confirmée par le serveur ; zéro avant le premier événement. */
    lastSequence: number;
    /** Position dans le morceau en millisecondes ; un déplacement ne vaut pas du temps écouté. */
    positionMs: number };
/** Session PostgreSQL avant conversion JSON, avec bigint pour les durées et Date pour les dates. */
export type SessionRow = {
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** UUID du morceau Catalogue, distinct de l’occurrence de playlist ou de la session. */
  trackId: string;
  /** Durée du morceau en millisecondes, figée à l’ouverture de la session. */
  trackDurationMs: bigint;
  /** Date d’ouverture de la session ; format ISO côté client, Date côté stockage. */
  startedAt: Date;
  /** Date de clôture ; null tant que la session reste ouverte. */
  endedAt: Date | null;
  /** Temps crédité par le serveur en millisecondes, plafonné à la durée du morceau. */
  listenedMs: bigint;
    /** Dernière séquence de progression confirmée par le serveur ; zéro avant le premier événement. */
    lastSequence: number };
/** Erreur métier d’écoute portant le statut HTTP et un code de refus public. */
export class PlaybackError extends Error {
  /** Initialise le statut et le code métier sans modifier une session. */
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
/**
 * Convertit un bigint positif ou nul en nombre JavaScript sans perte de précision ; rejette toute
 * valeur hors limites.
 */
export function safeNumber(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Unsupported stored integer");
  return Number(value);
}
/**
 * Vérifie les durées et la séquence stockées avant la conversion JSON ; renvoie les dates ISO et la
 * position fournie en millisecondes.
 */
export function toSession(row: SessionRow, positionMs = 0n): Session {
  const duration = safeNumber(row.trackDurationMs), listened = safeNumber(row.listenedMs), position = safeNumber(positionMs);
  if (duration <= 0 || listened > duration || position > duration || !Number.isInteger(row.lastSequence) || row.lastSequence < 0) throw new Error("Invalid stored session");
  return { id: row.id, trackId: row.trackId, trackDurationMs: duration, startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null, listenedMs: listened, lastSequence: row.lastSequence, positionMs: position };
}
/**
 * Accepte uniquement un trackId UUID dans le corps d’ouverture et le normalise en minuscules ; renvoie
 * null sinon.
 */
export function openInput(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && typeof body.trackId === "string" && uuidPattern.test(body.trackId) ? body.trackId.toLowerCase() : null;
}

/**
 * Événement client : séquence croissante, position et cumul de temps observé en millisecondes. Ce
 * cumul déclaré reste borné par le serveur.
 */
export type Progress = {
  /** Numéro positif de l’événement ; une répétition garde le même numéro et les mêmes valeurs. */
  sequence: number;
  /** Position dans le morceau en millisecondes ; un déplacement ne vaut pas du temps écouté. */
  positionMs: number;
  /** Cumul local déclaré en millisecondes ; le serveur borne le crédit réellement retenu. */
  listenedMsTotal: number };
/**
 * Valide les trois entiers non négatifs et une séquence SQL positive ; refuse les champs manquants,
 * inconnus ou hors limites.
 */
export function progressInput(value: unknown): Progress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 3 || !["sequence", "positionMs", "listenedMsTotal"].every(key =>
    typeof body[key] === "number" && Number.isSafeInteger(body[key]) && body[key] >= 0)) return null;
  if ((body.sequence as number) < 1 || (body.sequence as number) > 2147483647) return null;
  return body as Progress;
}

/** Page d’historique à partir de 1 et nombre maximal de sessions par page. */
export type PageQuery = {
  /** Numéro de page à partir de 1. */
  page: number;
  /** Nombre maximal d’éléments demandé par page, contrôlé par la route. */
  pageSize: number };
/** Page privée de sessions, avec total du compte et paramètres confirmés. */
export type SessionPage = PageQuery & {
  /** Nombre total d’éléments correspondant au filtre, avant la pagination. */
  total: number;
  /** Éléments de la page ou occurrences de playlist ; le total peut dépasser cette liste. */
  items: Session[] };
/**
 * Valide la pagination et le décalage compatible SQL ; applique 1 et 20 par défaut, avec taille
 * maximale 100.
 */
export function pageQuery(query: Record<string, unknown>): PageQuery | null {
  if (Object.keys(query).some(key => !["page", "pageSize"].includes(key))) return null;
  /** Convertit un entier positif sûr transmis en chaîne ; utilise le défaut si absent et NaN si invalide. */
  const positive = (value: unknown, fallback: number) => value === undefined ? fallback :
    typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
  const page = positive(query.page, 1), pageSize = positive(query.pageSize, 20);
  const skip = (page - 1) * pageSize;
  return Number.isFinite(page) && Number.isFinite(pageSize) && pageSize <= 100 && Number.isSafeInteger(skip) && skip <= 2147483647 ? { page, pageSize } : null;
}
/**
 * Retrouve la position de la dernière séquence confirmée avant de convertir la session ; rejette un
 * historique auquel cet événement manque.
 */
export function toHistorySession(row: SessionRow & {
  /** Événements nécessaires pour retrouver la dernière position confirmée. */
  events: Array<{
  /** Numéro positif de l’événement ; une répétition garde le même numéro et les mêmes valeurs. */
  sequence: number;
  /** Position dans le morceau en millisecondes ; un déplacement ne vaut pas du temps écouté. */
  positionMs: bigint }> }): Session {
  const latest = row.events.find(event => event.sequence === row.lastSequence);
  if (row.lastSequence > 0 && !latest) throw new Error("Missing latest event");
  return toSession(row, latest?.positionMs ?? 0n);
}
