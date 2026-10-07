export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PlaylistItem = { id: string; trackId: string; position: number };
export type Playlist = { id: string; name: string; description: string; version: number; items: PlaylistItem[] };
export type PageQuery = { page: number; pageSize: number };
export type PlaylistPage = PageQuery & { items: Playlist[]; total: number };

export function toPlaylist(row: { id: string; name: string; description: string | null; version: bigint; items: PlaylistItem[] }): Playlist {
  if (row.version < 1n || row.version > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Unsupported playlist version");
  return { id: row.id, name: row.name, description: row.description ?? "", version: Number(row.version),
    items: row.items.map(({ id, trackId, position }) => ({ id, trackId, position })) };
}

export function pageQuery(query: Record<string, unknown>): PageQuery | null {
  if (Object.keys(query).some(key => !["page", "pageSize"].includes(key))) return null;
  const positive = (value: unknown, fallback: number) => value === undefined ? fallback :
    typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
  const page = positive(query.page, 1), pageSize = positive(query.pageSize, 20);
  return Number.isFinite(page) && Number.isFinite(pageSize) && pageSize <= 100 && Number.isSafeInteger((page - 1) * pageSize)
    ? { page, pageSize } : null;
}
