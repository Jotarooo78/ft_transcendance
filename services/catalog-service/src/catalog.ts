export type TrackDto = {
  id: string;
  title: string;
  artistName: string;
  albumTitle: string;
  genre: string;
  durationMs: number | null;
  durationSeconds: number | null;
  audioAssetId: string | null;
  audioUrl: string | null;
};

export type TrackRow = {
  id: string;
  title: string;
  artistName: string;
  albumTitle: string;
  genre: string;
  durationMs: bigint | null;
  audioAssetId: string | null;
};

export function toTrackDto(row: TrackRow): TrackDto {
  const duration = row.durationMs === null ? null : Number(row.durationMs);
  if (duration !== null && (!Number.isSafeInteger(duration) || duration <= 0)) {
    throw new Error("Unrepresentable track duration");
  }
  return {
    id: row.id, title: row.title, artistName: row.artistName,
    albumTitle: row.albumTitle, genre: row.genre,
    durationMs: duration, durationSeconds: duration === null ? null : duration / 1000,
    audioAssetId: row.audioAssetId,
    audioUrl: row.audioAssetId ? `/api/media/assets/${row.audioAssetId}/audio` : null,
  };
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
