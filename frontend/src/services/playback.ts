/** Client JWT des sessions et de l’historique d’écoute ; les réponses sont contrôlées avant confirmation. */
import { authenticatedFetch } from "./api";
import { PlaybackRequestError } from "./playback-queue";

/**
 * Session confirmée par le serveur : position et temps crédité distincts, en millisecondes, et dates
 * ISO.
 */
export type PlaybackSession = {
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
  positionMs: number;
};
/**
 * Séquence, position et cumul local en millisecondes ; les répétitions doivent conserver exactement
 * ces trois valeurs.
 */
export type ProgressPayload = {
  /** Numéro positif de l’événement ; une répétition garde le même numéro et les mêmes valeurs. */
  sequence: number;
  /** Position dans le morceau en millisecondes ; un déplacement ne vaut pas du temps écouté. */
  positionMs: number;
  /** Cumul local déclaré en millisecondes ; le serveur borne le crédit réellement retenu. */
  listenedMsTotal: number;
};

/**
 * Valide les dates, les entiers et les bornes de la session avant de l’utiliser dans le lecteur ou
 * l’historique.
 */
export function isPlaybackSession(value: unknown): value is PlaybackSession {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.trackId === "string" &&
    typeof s.startedAt === "string" &&
    Number.isFinite(Date.parse(s.startedAt)) &&
    (s.endedAt === null ||
      (typeof s.endedAt === "string" &&
        Number.isFinite(Date.parse(s.endedAt)))) &&
    ["trackDurationMs", "listenedMs", "lastSequence", "positionMs"].every(
      (key) =>
        typeof s[key] === "number" &&
        Number.isSafeInteger(s[key]) &&
        s[key] >= 0,
    ) &&
    (s.trackDurationMs as number) > 0 &&
    (s.listenedMs as number) <= (s.trackDurationMs as number) &&
    (s.positionMs as number) <= (s.trackDurationMs as number)
  );
}

/**
 * Envoie une écriture JSON authentifiée avec délai de 5 s et keepalive. Distingue refus retentables et
 * réponse invalide puis valide la session renvoyée.
 */
async function writeSession(
  path: string,
  method: string,
  body: object,
): Promise<PlaybackSession> {
  const response = await authenticatedFetch(`/api/playback/sessions${path}`, {
    method,
    keepalive: true,
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new PlaybackRequestError(
      response.status >= 500,
      "Listening progress could not be saved.",
    );
  const session: unknown = await response.json();
  if (!isPlaybackSession(session))
    throw new PlaybackRequestError(false, "Invalid listening response.");
  return session;
}
/**
 * Ouvre une session neuve pour trackId et exige la bonne identité avec séquence zéro, temps crédité
 * nul et aucune date de fin. Notifie ensuite l’historique visible.
 */
export async function openPlayback(trackId: string) {
  const session = await writeSession("", "POST", { trackId });
  if (
    session.trackId !== trackId ||
    session.lastSequence !== 0 ||
    session.listenedMs !== 0 ||
    session.endedAt !== null
  ) {
    throw new PlaybackRequestError(false, "Invalid listening session opening.");
  }
  window.dispatchEvent(new Event("music-history-changed"));
  return session;
}
/**
 * Envoie la progression à la session identifiée avec PUT ; l’appelant conserve le même payload lors
 * des répétitions.
 */
export const savePlaybackProgress = (id: string, payload: ProgressPayload) =>
  writeSession(`/${encodeURIComponent(id)}/progress`, "PUT", payload);
/**
 * Demande la clôture de la session identifiée ; la route serveur confirme aussi une clôture déjà
 * enregistrée. Notifie l’historique seulement après confirmation.
 */
export const closePlayback = async (id: string) => {
  const session = await writeSession(
    `/${encodeURIComponent(id)}/close`,
    "POST",
    {},
  );
  window.dispatchEvent(new Event("music-history-changed"));
  return session;
};

/** Page privée de sessions avec taille et total confirmés. */
export type PlaybackHistory = {
  /** Éléments de la page ou occurrences de playlist ; le total peut dépasser cette liste. */
  items: PlaybackSession[];
  /** Numéro de page à partir de 1. */
  page: number;
  /** Nombre maximal d’éléments demandé par page, contrôlé par la route. */
  pageSize: number;
  /** Nombre total d’éléments correspondant au filtre, avant la pagination. */
  total: number;
};
/**
 * Charge une page de 20 sessions du compte et valide chaque session, le total et les paramètres ;
 * supporte l’annulation de l’écran.
 */
export async function getPlaybackHistory(
  page: number,
  signal?: AbortSignal,
): Promise<PlaybackHistory> {
  const response = await authenticatedFetch(
    `/api/playback/sessions?page=${page}&pageSize=20`,
    { signal },
  );
  if (!response.ok)
    throw new Error("Unable to load listening history. Please retry.");
  const data = await response.json();
  if (
    !data ||
    !Array.isArray(data.items) ||
    !data.items.every(isPlaybackSession) ||
    data.page !== page ||
    data.pageSize !== 20 ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0
  )
    throw new Error("Invalid listening history response.");
  return data;
}
