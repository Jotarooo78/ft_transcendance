import type { Track } from "../types/music";

export const mockTracks: Track[] = [
  {
    id: "track-1",
    title: "Balek",
    artistName: "Triangle De Bermudes ft Aya",
    albumTitle: "Midnight Stories",
    genre: "Synthwave",
    durationSeconds: 150,
    audioUrl: "/audio/Balek-Gospel-Version.mp3",
    mimeType: "audio/mpeg",
  },
  {
    id: "track-2",
    title: "Maladie",
    artistName: "Triangle De Bermudes",
    albumTitle: "Quiet Places",
    genre: "Ambient",
    durationSeconds: 157,
    audioUrl: "/audio/Maladie-Gospel-Version.mp3",
    mimeType: "audio/mpeg",
  },
  {
    id: "track-3",
    title: "Pile",
    artistName: "Triangle De Bermudes",
    albumTitle: "Human Machine",
    genre: "Electronic",
    durationSeconds: 123,
    audioUrl: "/audio/Pile-Gospel-Version.mp3",
    mimeType: "audio/mpeg",
  },
];
