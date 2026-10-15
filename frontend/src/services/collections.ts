import { requestJson } from "./request-json";
import type { CollectionKind, SavedReference } from "../types/collections";
/** Lit les pages bornées par le premier total ; déduplique les références déplacées entre deux pages. */
export async function getCollection(
  kind: CollectionKind,
  signal?: AbortSignal,
): Promise<SavedReference[]> {
  const result = new Map<string, SavedReference>();
  let lastPage = 1;
  for (let page = 1; page <= lastPage; page++) {
    const data = (await requestJson(
      `/api/library/collections/${kind}?page=${page}&pageSize=100`,
      { signal },
    )) as {
      items: SavedReference[];
      total: number;
      page: number;
      pageSize: number;
    };
    if (
      !Array.isArray(data.items) ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0 ||
      data.page !== page ||
      data.pageSize !== 100 ||
      !data.items.every(
        (item) =>
          typeof item.id === "string" && typeof item.createdAt === "string",
      )
    )
      throw new Error("Invalid library response.");
    if (page === 1) lastPage = Math.ceil(data.total / 100);
    for (const item of data.items) result.set(item.id, item);
  }
  return [...result.values()];
}
/** Commandes idempotentes ; aucune modification d'affichage avant confirmation serveur. */
export function setCollected(kind: CollectionKind, id: string, saved: boolean) {
  return requestJson(
    `/api/library/collections/${kind}/${encodeURIComponent(id)}`,
    { method: saved ? "PUT" : "DELETE" },
  );
}
