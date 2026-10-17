/** Vérifie les invariants d'affichage qui doivent rester indépendants du lecteur et de l'ordre stocké. */
import assert from "node:assert/strict";
import test from "node:test";
import { playlistView } from "./playlist-view.ts";
import type { MusicPlaylist, Track } from "../types/music.ts";
/** Morceau minimal conservant une identité distincte de ses occurrences. */
const track = (id: string, title: string, artistName: string): Track => ({
  id,
  title,
  artistName,
  albumTitle: "",
  genre: "",
  audioUrl: null,
  durationSeconds: null,
});
test("sorting changes the complete queue but filtering only changes visible rows", () => {
  const playlist: MusicPlaylist = {
    id: "playlist",
    name: "Test",
    description: "",
    visibility: "private",
    version: 1,
    items: [
      { id: "one", trackId: "a", position: 2, addedAt: "2026-01-01T00:00:00Z" },
      { id: "two", trackId: "b", position: 4, addedAt: "2026-02-01T00:00:00Z" },
      {
        id: "three",
        trackId: "a",
        position: 8,
        addedAt: "2026-03-01T00:00:00Z",
      },
      { id: "four", trackId: "gone", position: 9 },
    ],
  };
  const details = { a: track("a", "Zebra", "A"), b: track("b", "Alpha", "Z") };
  const original = structuredClone(playlist);
  const title = playlistView(playlist, details, "title", "alpha");
  assert.deepEqual(
    title.visible.map((entry) => entry.item.id),
    ["two"],
  );
  assert.deepEqual(
    title.ordered.filter((entry) => entry.track).map((entry) => entry.item.id),
    ["two", "one", "three"],
  );
  assert.deepEqual(
    playlistView(playlist, details, "added", "").ordered.map(
      (entry) => entry.item.id,
    ),
    ["three", "two", "one", "four"],
  );
  assert.deepEqual(
    playlistView(playlist, details, "manual", "").ordered.map(
      (entry) => entry.item.id,
    ),
    ["one", "two", "three", "four"],
  );
  assert.deepEqual(
    playlist,
    original,
    "display choices never rewrite stored order or occurrences",
  );
});
