import { mockPlaylists } from "../data/playlists";
import type { Playlist } from "../types/music";

const STORAGE_KEY = "ft-music:playlists:v1";

export function loadPlaylists(): Playlist[] {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY);

    if (storedValue === null) {
      return mockPlaylists;
    }

    const parsedValue: unknown = JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return mockPlaylists;
    }

    const isValid = parsedValue.every((value) => {
      if (typeof value !== "object" || value === null) {
        return false;
      }

      const playlist = value as Record<string, unknown>;

      return (
        typeof playlist.id === "string" &&
        typeof playlist.name === "string" &&
        typeof playlist.description === "string" &&
        Array.isArray(playlist.trackIds) &&
        playlist.trackIds.every(
          (trackId: unknown) => typeof trackId === "string",
        )
      );
    });

    return isValid ? (parsedValue as Playlist[]) : mockPlaylists;
  } catch {
    return mockPlaylists;
  }
}

export function savePlaylists(playlists: Playlist[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
  } catch (error) {
    console.error("Unable to save playlists locally:", error);
  }
}
