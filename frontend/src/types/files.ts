/** Métadonnées publiques des fichiers, limites en octets décimaux et états du transfert navigateur. */
/** Fichier confirmé ready par Media : aucun chemin disque, propriétaire ou checksum n’est transmis. */
export type ReadyFile = {
  /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
  id: string;
  /** Seuls les audios forment des entrées ; les images sont leurs pochettes facultatives. */
  usage: "audio";
  /** ready uniquement : le serveur a confirmé le fichier avant de le présenter au client. */
  state: "ready";
  /** Type MIME du contenu vérifié, utilisé pour servir les octets avec leur format. */
  mimeType: string;
  /** Taille exacte de l’original ou de la variante en octets, pas en mégaoctets. */
  byteSize: number;
  /** Durée en millisecondes ; null lorsque cette durée n’est pas disponible ou ne s’applique pas. */
  durationMs: number | null;
  /** Métadonnées de la pochette active ; null signifie visuel par défaut. */
  cover: AudioCover | null;
  /** L’audio est confirmé, mais son image intégrée n’a pas pu être utilisée. */
  warning?: "cover_unavailable";
};
/** Représentation image d’un audio ; l’identifiant change après remplacement. */
export type AudioCover = {
  /** UUID de la représentation, sans chemin de stockage. */
  id: string;
  /** Format réel de l’image validée. */
  mimeType: string;
  /** Taille exacte en octets, bornée à 25 Mo. */
  byteSize: number;
};
/** Refuse les métadonnées de pochette inattendues avant toute lecture dans le navigateur. */
export function isAudioCover(value: unknown): value is AudioCover {
  if (!value || typeof value !== "object") return false;
  const cover = value as Record<string, unknown>;
  return typeof cover.id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(cover.id) &&
    typeof cover.mimeType === "string" && ["image/png", "image/jpeg", "image/webp"].includes(cover.mimeType) &&
    Number.isSafeInteger(cover.byteSize) && Number(cover.byteSize) > 0 && Number(cover.byteSize) <= imageByteLimit;
}
/**
 * Progression réelle du transfert puis validation serveur. percent et total sont null lorsque le
 * navigateur ne peut pas mesurer le total.
 */
export type UploadProgress = {
  /** sending pendant le transfert réel, validating pendant l’attente de confirmation serveur. */
  phase: "sending" | "validating";
  /** Pourcentage de transfert réel ; null lorsque le total ne peut pas être mesuré. */
  percent: number | null;
  /** Octets déjà transmis, mesurés par le navigateur. */
  loaded: number;
  /** Octets totaux du transfert ; null si le navigateur ne peut pas les mesurer. */
  total: number | null;
};
/** Limite audio : 500 000 000 octets, soit 500 Mo décimaux ; contrôle client et serveur cohérent. */
export const audioByteLimit = 500_000_000;
/** Limite image : 25 000 000 octets, soit 25 Mo décimaux ; indépendante du plafond audio. */
export const imageByteLimit = 25_000_000;
/**
 * Vérifie les six champs publics, les formats image autorisés, les bornes de taille et la durée audio
 * positive avant d’accepter la confirmation serveur.
 */
export function isReadyFile(value: unknown): value is ReadyFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file.id === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      file.id,
    ) &&
    file.state === "ready" &&
    file.usage === "audio" &&
    typeof file.mimeType === "string" &&
    Number.isSafeInteger(file.byteSize) &&
    Number(file.byteSize) > 0 &&
    Number(file.byteSize) <= audioByteLimit && file.mimeType.startsWith("audio/") &&
    Number.isSafeInteger(file.durationMs) && Number(file.durationMs) > 0 &&
    (file.cover === null || isAudioCover(file.cover)) &&
    (file.warning === undefined || file.warning === "cover_unavailable")
  );
}
