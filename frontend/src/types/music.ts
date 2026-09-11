export type Track = {
  id: string;
  title: string;
  artistName: string;
  albumTitle: string;
  genre: string;
  durationSeconds: number;
  audioUrl: string; // /audio/xxx.mp3
  mimeType: string; // mpeg
};
