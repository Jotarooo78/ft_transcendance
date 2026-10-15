/** Règles pures de la file musicale, indépendantes du navigateur et du suivi d’écoute. */
import type { Track } from "../types/music.ts";

/** Répète zéro fois, toute la sélection ou seulement l’occurrence courante. */
export type RepeatMode = "off" | "all" | "one";
/** Une place indépendante dans la file, même si le morceau apparaît plusieurs fois. */
export type QueueEntry = {
  /** Identité locale unique de la place. */ key: string;
  /** Identité de la ligne d’origine, notamment une occurrence de playlist. */ occurrence: string;
  /** Métadonnées publiques du morceau. */ track: Track;
};
/** État sérialisable ; original garde l’ordre édité, order l’ordre effectivement joué. */
export type MusicQueue = {
  /** Occurrences rangées dans leur ordre initial, avec les ajouts manuels. */ entries: QueueEntry[];
  /** Identités dans l’ordre de lecture. */ order: string[];
  /** Place sélectionnée, ou aucune. */ current: string | null;
  /** Places réellement écoutées, de la plus ancienne à la plus récente. */ history: string[];
  /** Retour en avant après une commande précédent. */ forward: string[];
  /** Mélange activé. */ shuffle: boolean;
  /** Mode de répétition. */ repeat: RepeatMode;
  /** Libellé de la sélection qui a lancé la file. */ source: string;
};
/** Produit un état neuf, sans partager de tableau mutable. */
export function emptyQueue(): MusicQueue {
  return { entries: [], order: [], current: null, history: [], forward: [], shuffle: false, repeat: "off", source: "Your queue" };
}
/** Mélange Fisher–Yates ; l’aléa injectable rend les preuves reproductibles. */
export function shuffled<T>(values: T[], random = Math.random): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
/** Construit une sélection entière en démarrant à la place demandée. */
export function selectQueue(entries: QueueEntry[], index: number, previous: MusicQueue, source: string, shuffle = previous.shuffle, random = Math.random): MusicQueue {
  const current = entries[index]?.key ?? null;
  const keys = entries.map((entry) => entry.key);
  return { ...previous, entries, source, current, shuffle, history: [], forward: [], order: shuffle && current ? [current, ...shuffled(keys.filter((key) => key !== current), random)] : keys };
}
/** Change le mélange sans couper le morceau ; conserve le préfixe déjà parcouru à l’activation. */
export function toggleShuffle(queue: MusicQueue, random = Math.random): MusicQueue {
  const index = queue.order.indexOf(queue.current ?? "");
  return { ...queue, shuffle: !queue.shuffle, forward: [], order: queue.shuffle ? queue.entries.map((entry) => entry.key) : [...queue.order.slice(0, index + 1), ...shuffled(queue.order.slice(index + 1), random)] };
}
/** Avance, répète ou indique une fin ; une commande manuelle ignore la répétition d’un morceau. */
export function nextQueue(queue: MusicQueue, natural = false, random = Math.random): MusicQueue | null {
  if (!queue.current) return null;
  if (natural && queue.repeat === "one") return queue;
  const history = [...queue.history, queue.current].slice(-500);
  if (queue.forward.length) return { ...queue, current: queue.forward[0], forward: queue.forward.slice(1), history };
  const index = queue.order.indexOf(queue.current);
  if (index + 1 < queue.order.length) return { ...queue, current: queue.order[index + 1], history };
  if (queue.repeat !== "all" || !queue.order.length) return null;
  const order = queue.shuffle ? shuffled(queue.entries.map((entry) => entry.key), random) : queue.order;
  // Au changement de tour, évite une répétition immédiate lorsque plusieurs places existent.
  if (queue.shuffle && order.length > 1 && order[0] === queue.current) [order[0], order[1]] = [order[1], order[0]];
  return { ...queue, current: order[0], order, history };
}
/** Revient dans l’historique réel ; sans précédent, le moteur recommencera l’audio courant. */
export function previousQueue(queue: MusicQueue): MusicQueue {
  const previous = queue.history.at(-1);
  return previous ? { ...queue, current: previous, history: queue.history.slice(0, -1), forward: [queue.current!, ...queue.forward] } : queue;
}
/** Ajoute une occurrence après la courante ou à la fin, même en mode aléatoire. */
export function insertQueue(queue: MusicQueue, entry: QueueEntry, next: boolean): MusicQueue {
  if (!queue.current) return selectQueue([entry], 0, queue, "Your queue");
  const entries = [...queue.entries], order = [...queue.order];
  entries.splice(next ? entries.findIndex((item) => item.key === queue.current) + 1 : entries.length, 0, entry);
  order.splice(next ? order.indexOf(queue.current) + 1 : order.length, 0, entry.key);
  return { ...queue, entries, order, forward: next && queue.forward.length ? [entry.key, ...queue.forward] : queue.forward };
}
/** Retire une seule occurrence ; le morceau courant ne peut pas être supprimé ici. */
export function removeQueue(queue: MusicQueue, key: string): MusicQueue {
  if (key === queue.current) return queue;
  return { ...queue, entries: queue.entries.filter((entry) => entry.key !== key), order: queue.order.filter((id) => id !== key), history: queue.history.filter((id) => id !== key), forward: queue.forward.filter((id) => id !== key) };
}
/** Retourne les occurrences à venir, sans anticiper le tour suivant. */
export function upcoming(queue: MusicQueue): QueueEntry[] {
  const keys = [...queue.forward, ...queue.order.slice(queue.order.indexOf(queue.current ?? "") + 1)];
  return [...new Set(keys)].flatMap((key) => queue.entries.find((entry) => entry.key === key) ?? []);
}
