/** Confirmation commune à tous les chemins d'ajout, y compris un projet entier. */
import type { MusicPlaylist } from "../types/music";
import type { PlaylistSelection } from "../contexts/playlist-actions";
import type { useLibrary } from "../hooks/useLibrary";
/** Demande une seule confirmation pour toutes les répétitions, puis applique le lot atomiquement. */
export async function addPlaylistTracks(
  library: ReturnType<typeof useLibrary>,
  playlist: MusicPlaylist,
  tracks: PlaylistSelection,
) {
  if (!tracks.length || tracks.length > 500)
    throw new Error("Select between 1 and 500 tracks.");
  const seen = new Set(playlist.items.map((item) => item.trackId));
  const duplicates: string[] = [];
  for (const track of tracks) {
    if (seen.has(track.id)) duplicates.push(track.title);
    seen.add(track.id);
  }
  if (
    duplicates.length &&
    !window.confirm(
      `${duplicates.length} repeated track(s): ${duplicates.slice(0, 8).join(", ")}${duplicates.length > 8 ? "…" : ""}. Add all selected tracks anyway?`,
    )
  )
    return null;
  return library.perform(playlist, {
    kind: "add",
    trackIds: tracks.map((t) => t.id),
    allowDuplicates: duplicates.length > 0,
  });
}
