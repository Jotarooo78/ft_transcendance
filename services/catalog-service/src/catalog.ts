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

export type TrackQuery = { page: number; pageSize: number; q: string; genre: string; sort: "title" | "artist" | "duration" };
export type TrackList = { items: TrackDto[]; total: number; page: number; pageSize: number; genres: string[] };

export function parseTrackQuery(query: Record<string, unknown>): TrackQuery | null {
  if (Object.keys(query).some(key => !["page", "pageSize", "q", "genre", "sort"].includes(key))) return null;
  const integer = (value: unknown, fallback: number): number =>
    value === undefined ? fallback : typeof value === "string" && /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN;
  const page = integer(query.page, 1), pageSize = integer(query.pageSize, 20);
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize) || pageSize > 100 ||
      !Number.isSafeInteger((page - 1) * pageSize)) return null;
  const q = query.q ?? "", genre = query.genre ?? "", sort = query.sort ?? "title";
  if (typeof q !== "string" || q.length > 200 || typeof genre !== "string" || genre.length > 200 ||
      (sort !== "title" && sort !== "artist" && sort !== "duration")) return null;
  return { page, pageSize, q: q.trim(), genre: genre.trim(), sort };
}
