/** Recherche publique de comptes artistes, paginée côté Users. */
import { requestJson } from "./request-json";
import type { MusicArtist, MusicPage } from "../types/projects";
/** Vérifie seulement les données publiques nécessaires à la carte artiste. */
export function isArtist(value: unknown): value is MusicArtist {
  if (!value || typeof value !== "object") return false;
  const a = value as MusicArtist;
  return (
    typeof a.userId === "string" &&
    typeof a.displayName === "string" &&
    typeof a.username === "string" &&
    (a.avatarUrl === null || typeof a.avatarUrl === "string")
  );
}
/** Charge une page de résultats globaux, incluant le compte connecté s’il correspond. */
export async function getArtists(
  q = "",
  page = 1,
  signal?: AbortSignal,
): Promise<MusicPage<MusicArtist>> {
  const params = new URLSearchParams({ q, page: String(page), pageSize: "24" });
  const data = (await requestJson(
    `/api/users/artists?${params}`,
    { signal },
    false,
  )) as MusicPage<MusicArtist>;
  if (
    !data ||
    !Array.isArray(data.items) ||
    !data.items.every(isArtist) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    data.page !== page ||
    data.pageSize !== 24
  )
    throw new Error("Invalid artist list.");
  return data;
}

/** Relit le profil actuel et valide la même projection que les cartes de recherche. */
export async function getArtist(
  id: string,
  signal?: AbortSignal,
): Promise<MusicArtist> {
  const value = await requestJson(
    `/api/users/profiles/${encodeURIComponent(id)}`,
    { signal },
    false,
  );
  if (
    !isArtist(value) ||
    value.userId !== id ||
    (value.bio !== undefined &&
      value.bio !== null &&
      typeof value.bio !== "string")
  )
    throw new Error("Invalid artist response.");
  return value;
}
