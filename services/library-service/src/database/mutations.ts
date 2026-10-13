/** Écritures de playlists sérialisées par verrou SQL et version attendue, toujours dans le compte propriétaire. */
import { prisma } from "./prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PlaylistError, toPlaylist, type Playlist, type PlaylistInput } from "../playlist.js";

/**
 * Verrouille la playlist privée du propriétaire pour toute la transaction. Renvoie 404 pour une
 * absence et 409 si expectedVersion est périmée, puis exécute le changement sous ce verrou.
 */
async function withPlaylist<T>(owner: string, id: string, expectedVersion: number,
  change: (tx: Prisma.TransactionClient, version: bigint) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{
      /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
      id: string;
      /** Version de concurrence de la playlist ; une mutation réussie l’incrémente. */
      version: bigint }>>`
      SELECT id, version FROM library.playlists
      WHERE id=${id}::uuid AND owner_user_id=${owner}::uuid AND visibility='private' FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new PlaylistError(404, "playlist_not_found");
    if (row.version !== BigInt(expectedVersion)) throw new PlaylistError(409, "version_conflict");
    return change(tx, row.version);
  });
}

/**
 * Ajoute une nouvelle occurrence en fin de playlist et incrémente la version. Le même trackId peut
 * apparaître plusieurs fois avec des id distincts ; les limites SQL et JavaScript sont contrôlées.
 */
export async function addItem(owner: string, id: string, trackId: string, expectedVersion: number): Promise<Playlist> {
  return withPlaylist(owner, id, expectedVersion, async (tx, version) => {
    if (version >= BigInt(Number.MAX_SAFE_INTEGER)) throw new PlaylistError(409, "playlist_limit");
    const last = await tx.playlistItem.aggregate({ where: { playlistId: id }, _max: { position: true } });
    const position = (last._max.position ?? 0) + 1;
    if (position > 2147483647) throw new PlaylistError(409, "playlist_limit");
    await tx.playlistItem.create({ data: { playlistId: id, trackId, position, addedByUserId: owner } });
    return toPlaylist(await tx.playlist.update({ where: { id }, data: { version: { increment: 1 } },
      include: { items: { orderBy: { position: "asc" } } } }));
  });
}

/**
 * Retire uniquement itemId de cette playlist et incrémente sa version ; les positions restantes ne
 * sont pas renumérotées.
 */
export async function removeItem(owner: string, id: string, itemId: string, expectedVersion: number): Promise<Playlist> {
  return withPlaylist(owner, id, expectedVersion, async (tx, version) => {
    if (version >= BigInt(Number.MAX_SAFE_INTEGER)) throw new PlaylistError(409, "playlist_limit");
    const removed = await tx.playlistItem.deleteMany({ where: { id: itemId, playlistId: id } });
    if (removed.count !== 1) throw new PlaylistError(404, "item_not_found");
    return toPlaylist(await tx.playlist.update({ where: { id }, data: { version: { increment: 1 } },
      include: { items: { orderBy: { position: "asc" } } } }));
  });
}

/** Applique les champs validés sous verrou, incrémente la version et renvoie la playlist confirmée. */
export async function updatePlaylist(owner: string, id: string, changes: Partial<PlaylistInput>, expectedVersion: number): Promise<Playlist> {
  return withPlaylist(owner, id, expectedVersion, async (tx, version) => {
    if (version >= BigInt(Number.MAX_SAFE_INTEGER)) throw new PlaylistError(409, "playlist_limit");
    return toPlaylist(await tx.playlist.update({ where: { id }, data: { ...changes, version: { increment: 1 } },
      include: { items: { orderBy: { position: "asc" } } } }));
  });
}

/**
 * Supprime la playlist détenue par owner après contrôle de version. La clé étrangère supprime ses
 * seules occurrences locales ; les morceaux Catalogue restent intacts.
 */
export async function deletePlaylist(owner: string, id: string, expectedVersion: number): Promise<void> {
  return withPlaylist(owner, id, expectedVersion, async tx => {
    // The local FK cascades only to this playlist's occurrences.
    await tx.playlist.delete({ where: { id } });
  });
}
