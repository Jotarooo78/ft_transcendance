/** Reprise locale par compte ; ne stocke ni jeton, ni URL audio, ni profil. */
import type { MusicQueue, RepeatMode } from "../services/music-queue.ts";
/** Version stable du document sauvegardé ; les détails sont relus auprès du Catalogue. */
export type SavedPlayer = {
  /** Version du format, contrôlée avant restauration. */ version: 1;
  /** Références minimales des occurrences. */ entries: {
    key: string;
    occurrence: string;
    trackId: string;
  }[];
  /** Ordre de lecture, distinct de l’ordre des entrées. */ order: string[];
  /** Occurrence choisie. */ current: string | null;
  /** Parcours récent pour précédent. */ history: string[];
  /** Retour en avant après précédent. */ forward: string[];
  /** Libellé de l’origine. */ source: string;
  /** Absent sur les anciennes sauvegardes : leur libellé est conservé tel quel. */ sourceLocalized?: boolean;
  /** Aléatoire activé. */ shuffle: boolean;
  /** Mode de répétition validé. */ repeat: RepeatMode;
  /** Position en secondes. */ position: number;
  /** Volume entre zéro et un. */ volume: number;
  /** Sourdine indépendante du volume. */ muted: boolean;
};
/** Surface minimale injectable pour vérifier un stockage refusé ou corrompu. */
type PlayerStorage = Pick<Storage, "getItem" | "setItem">;
/** Clé isolée par compte ; aucune préférence d’un invité n’est transférée au compte suivant. */
function key(account: string) {
  return `ft.music-player.v1:${account}`;
}
/** Valide le document complet avant d’en utiliser les tableaux ou les identités. */
export function validSavedPlayer(value: unknown): value is SavedPlayer {
  if (!value || typeof value !== "object") return false;
  const s = value as SavedPlayer;
  if (
    s.version !== 1 ||
    !Array.isArray(s.entries) ||
    s.entries.length > 10000 ||
    typeof s.source !== "string" ||
    (s.sourceLocalized !== undefined &&
      typeof s.sourceLocalized !== "boolean") ||
    s.source.length > 240 ||
    typeof s.shuffle !== "boolean" ||
    typeof s.muted !== "boolean" ||
    !["off", "all", "one"].includes(s.repeat) ||
    !Number.isFinite(s.position) ||
    s.position < 0 ||
    !Number.isFinite(s.volume) ||
    s.volume < 0 ||
    s.volume > 1
  )
    return false;
  if (
    !s.entries.every(
      (e) =>
        e &&
        typeof e.key === "string" &&
        e.key.length > 0 &&
        e.key.length <= 256 &&
        typeof e.occurrence === "string" &&
        e.occurrence.length <= 256 &&
        typeof e.trackId === "string" &&
        /^[a-f0-9-]{36}$/i.test(e.trackId),
    )
  )
    return false;
  const keys = new Set(s.entries.map((e) => e.key));
  return (
    keys.size === s.entries.length &&
    [s.order, s.history, s.forward].every(
      (ids) =>
        Array.isArray(ids) &&
        ids.length <= 10000 &&
        ids.every((id) => keys.has(id)),
    ) &&
    s.history.length <= 500 &&
    s.order.length === keys.size &&
    new Set(s.order).size === keys.size &&
    (s.current === null ? keys.size === 0 : keys.has(s.current))
  );
}
/** Une préférence illisible ou un stockage refusé équivaut à une absence de reprise. */
export function readPlayer(
  account?: string,
  storage?: PlayerStorage,
): SavedPlayer | null {
  if (!account) return null;
  try {
    const raw = (storage ?? localStorage).getItem(key(account));
    const value: unknown = raw ? JSON.parse(raw) : null;
    return validSavedPlayer(value) ? value : null;
  } catch {
    return null;
  }
}
/** Sauvegarde les seules références utiles ; les erreurs de quota ne bloquent jamais l’audio. */
export function writePlayer(
  account: string | undefined,
  queue: MusicQueue,
  position: number,
  volume: number,
  muted: boolean,
  storage?: PlayerStorage,
): void {
  if (!account) return;
  const value: SavedPlayer = {
    version: 1,
    entries: queue.entries.map(({ key, occurrence, track }) => ({
      key,
      occurrence,
      trackId: track.id,
    })),
    order: queue.order,
    current: queue.current,
    history: queue.history,
    forward: queue.forward,
    source: queue.source.slice(0, 240),
    sourceLocalized: queue.sourceLocalized,
    shuffle: queue.shuffle,
    repeat: queue.repeat,
    position: Math.max(0, position),
    volume,
    muted,
  };
  try {
    if (validSavedPlayer(value))
      (storage ?? localStorage).setItem(key(account), JSON.stringify(value));
  } catch {
    /* L’écoute reste utilisable sans stockage local. */
  }
}
