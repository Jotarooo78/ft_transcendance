export function catalogReader(baseUrl: string, timeoutMs = 2000) {
  return async (id: string): Promise<boolean> => {
    const response = await fetch(new URL(`/tracks/${id}`, baseUrl), {
      signal: AbortSignal.timeout(timeoutMs), redirect: "error",
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error("Catalogue unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("id" in data) || data.id !== id) throw new Error("Invalid track response");
    return true;
  };
}
