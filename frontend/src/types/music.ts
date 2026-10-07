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
