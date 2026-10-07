export function catalogReader(baseUrl: string, timeoutMs = 2000) {
  return async (id: string): Promise<number | null> => {
    const response = await fetch(new URL(`/tracks/${id}`, baseUrl), { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Catalogue unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("id" in data) || data.id !== id || !("durationMs" in data) ||
      typeof data.durationMs !== "number" || !Number.isSafeInteger(data.durationMs) || data.durationMs <= 0) throw new Error("Invalid track duration");
    return data.durationMs;
  };
}
