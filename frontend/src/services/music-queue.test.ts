/** Preuves des transitions, indépendantes des événements audio du navigateur. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyQueue,
  selectQueue,
  nextQueue,
  previousQueue,
  toggleShuffle,
  insertQueue,
  removeQueue,
  upcoming,
  type QueueEntry,
} from "./music-queue.ts";
import type { Track } from "../types/music.ts";
/** Produit trois places, dont deux correspondent volontairement au même morceau. */
const entries: QueueEntry[] = ["a", "b", "c"].map((key, index) => ({
  key,
  occurrence: key,
  track: { id: index === 2 ? "a" : key } as Track,
}));
/** Sélection ordonnée, démarrant sur la première place. */
const initial = () => selectQueue(entries, 0, emptyQueue(), "Test");
test("la sélection conserve les places précédentes et distingue les doublons", () => {
  const q = selectQueue(entries, 2, emptyQueue(), "Test");
  assert.equal(q.current, "c");
  assert.equal(q.entries.length, 3);
  assert.equal(nextQueue(q), null);
});
test("fin, répétition de file et répétition du titre diffèrent du suivant manuel", () => {
  const q = initial();
  assert.equal(nextQueue({ ...q, repeat: "one" }, true)?.current, "a");
  assert.equal(nextQueue({ ...q, repeat: "one" })?.current, "b");
  const end = { ...q, current: "c" };
  assert.equal(nextQueue(end, true), null);
  assert.equal(nextQueue({ ...end, repeat: "all" }, true)?.current, "a");
  assert.equal(nextQueue({ ...end, repeat: "one" }), null);
});
test("précédent puis suivant retracent le parcours réellement écouté", () => {
  let q = selectQueue(entries, 0, emptyQueue(), "Test", true, () => 0);
  q = nextQueue(q)!;
  assert.equal(q.current, "c");
  q = previousQueue(q);
  assert.equal(q.current, "a");
  q = nextQueue(q)!;
  assert.equal(q.current, "c");
});
test("le mélange conserve le courant, parcourt chaque place et restaure l’ordre initial", () => {
  let q = toggleShuffle(initial(), () => 0);
  assert.equal(q.current, "a");
  assert.equal(new Set(q.order).size, 3);
  assert.deepEqual(q.order, ["a", "c", "b"]);
  q = nextQueue(q)!;
  q = toggleShuffle(q);
  assert.equal(q.current, "c");
  assert.deepEqual(q.order, ["a", "b", "c"]);
});
test("nouveau tour mélangé sans répétition immédiate et file à un seul titre", () => {
  const q = {
    ...initial(),
    shuffle: true,
    repeat: "all" as const,
    current: "a",
    order: ["b", "c", "a"],
  };
  assert.notEqual(nextQueue(q, true, () => 0.99)?.current, "a");
  const single = selectQueue(entries.slice(0, 1), 0, q, "Single");
  assert.equal(nextQueue(single, true)?.current, "a");
});
test("ajout et retrait ciblent une occurrence sans modifier la sélection source", () => {
  const q = initial();
  const entry = { ...entries[0], key: "manual" };
  const inserted = insertQueue(q, entry, true);
  assert.equal(nextQueue(inserted)?.current, "manual");
  assert.deepEqual(
    upcoming(inserted).map((item) => item.key),
    ["manual", "b", "c"],
  );
  assert.deepEqual(removeQueue(inserted, "manual"), q);
  assert.equal(removeQueue(q, "a"), q);
  assert.equal(q.entries.length, 3);
});
test("ajout après un retour précédent reste prioritaire", () => {
  const q = previousQueue(nextQueue(initial())!);
  const inserted = insertQueue(q, { ...entries[0], key: "manual" }, true);
  assert.equal(nextQueue(inserted)?.current, "manual");
  assert.equal(nextQueue(nextQueue(inserted)!)?.current, "b");
});
