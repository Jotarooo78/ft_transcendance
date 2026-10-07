export function publicationReader(baseUrl: string, timeoutMs = 2000) {
  return async (id: string): Promise<boolean> => {
    const response = await fetch(new URL(`/assets/${id}/publication`, baseUrl), {
      signal: AbortSignal.timeout(timeoutMs), redirect: "error",
    });
    if (!response.ok) throw new Error("Catalogue unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("published" in data) || typeof data.published !== "boolean") {
      throw new Error("Invalid publication response");
    }
    return data.published;
  };
}
