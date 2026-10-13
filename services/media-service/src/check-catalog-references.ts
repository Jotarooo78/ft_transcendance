export function catalogReferences(baseUrl: string, token: string, timeoutMs = 2000) {
  if (!token.trim()) throw new Error("INTERNAL_SERVICE_TOKEN is required");
  return async (id: string): Promise<boolean> => {
    const response = await fetch(new URL(`/internal/assets/${id}/references`, baseUrl), {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs), redirect: "error",
    });
    if (!response.ok || !response.body) throw new Error("Catalogue unavailable");
    const reader = response.body.getReader(); let text = "";
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        text += Buffer.from(chunk.value).toString("utf8");
        if (text.length > 4096) throw new Error("Invalid references response");
      }
    } finally { await reader.cancel(); }
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || !("referenced" in data) || typeof data.referenced !== "boolean") throw new Error("Invalid references response");
    return data.referenced;
  };
}
