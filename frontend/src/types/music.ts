export type Track = {
  id: string;
  title: string;
  artistName: string;
  albumTitle: string;
  genre: string;
  durationSeconds: number | null;
  durationMs?: number | null;
  audioAssetId?: string | null;
  audioUrl: string | null;
  mimeType?: string;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
};

// Server representation; the legacy Playlist type remains for unused local files.
export type PlaylistItem = { id: string; trackId: string; position: number };
export type PrivatePlaylist = {
  id: string;
  name: string;
  description: string;
  version: number;
  items: PlaylistItem[];
};
