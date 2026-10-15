/** Ordre d’affichage et ordre de lecture des occurrences, indépendants de la recherche. */
import type { MusicPlaylist, Track } from "../types/music";
export type PlaylistSort = "manual" | "title" | "artist" | "added";
/** Trie de façon stable puis filtre seulement l’affichage ; les titres absents restent identifiables. */
export function playlistView(
  playlist: MusicPlaylist,
  details: Record<string, Track | null>,
  sort: PlaylistSort,
  query: string,
) {
  const ordered = playlist.items
    .map((item) => ({ item, track: details[item.trackId] ?? null }))
    .sort((a, b) => {
      const result =
        sort === "title"
          ? (a.track?.title ?? "").localeCompare(b.track?.title ?? "")
          : sort === "artist"
            ? (a.track?.artistName ?? "").localeCompare(
                b.track?.artistName ?? "",
              )
            : sort === "added"
              ? (b.item.addedAt ?? "").localeCompare(a.item.addedAt ?? "")
              : 0;
      return result || a.item.position - b.item.position;
    });
  const needle = query.trim().toLocaleLowerCase();
  return {
    ordered,
    visible: ordered.filter(
      ({ track }) =>
        !needle ||
        `${track?.title ?? ""} ${track?.artistName ?? ""}`
          .toLocaleLowerCase()
          .includes(needle),
    ),
  };
}
