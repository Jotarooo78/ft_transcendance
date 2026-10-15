/** Vérifie la séparation des comptes et le refus des données locales invalides. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readPlayer, writePlayer, validSavedPlayer } from "./player-storage.ts";
import { emptyQueue } from "../services/music-queue.ts";
/** Stockage en mémoire sans accès au navigateur. */
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

test("volume et modes sont isolés par compte et aucune URL n’est persistée", () => {
  const store = storage(),
    q = { ...emptyQueue(), shuffle: true, repeat: "one" as const };
  writePlayer("alice", q, 0, 0.4, true, store);
  assert.equal(readPlayer("alice", store)?.volume, 0.4);
  assert.equal(readPlayer("alice", store)?.repeat, "one");
  assert.equal(readPlayer("bob", store), null);
  assert.equal(readPlayer(undefined, store), null);
  assert(!store.getItem("ft.music-player.v1:alice")!.includes("audioUrl"));
});
test("documents corrompus, versions inconnues et valeurs hors bornes sont ignorés", () => {
  const store = storage();
  store.setItem("ft.music-player.v1:alice", "{");
  assert.equal(readPlayer("alice", store), null);
  writePlayer("alice", emptyQueue(), 0, 1, false, store);
  const s = readPlayer("alice", store)!;
  assert(!validSavedPlayer({ ...s, version: 2 }));
  assert(!validSavedPlayer({ ...s, volume: 2 }));
  assert(!validSavedPlayer({ ...s, order: ["absent"] }));
  assert(!validSavedPlayer({ ...s, entries: [null] }));
});
test("un refus du stockage n’empêche ni lecture ni sauvegarde en mémoire", () => {
  const blocked = {
    getItem: () => {
      throw Error("Denied");
    },
    setItem: () => {
      throw Error("Quota");
    },
  };
  assert.equal(readPlayer("alice", blocked), null);
  assert.doesNotThrow(() =>
    writePlayer("alice", emptyQueue(), 0, 1, false, blocked),
  );
});
