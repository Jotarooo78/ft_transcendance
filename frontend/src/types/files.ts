export type ReadyFile = {
  id: string; usage: "audio" | "image"; state: "ready"; mimeType: string;
  byteSize: number; durationMs: number | null;
};
export type UploadProgress = { phase: "sending" | "validating"; percent: number | null; loaded: number; total: number | null };
export const audioByteLimit = 500_000_000;
export const imageByteLimit = 25_000_000;
export function isReadyFile(value: unknown): value is ReadyFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return typeof file.id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(file.id) &&
    file.state === "ready" && (file.usage === "audio" || file.usage === "image") && typeof file.mimeType === "string" &&
    Number.isSafeInteger(file.byteSize) && Number(file.byteSize) > 0 && Number(file.byteSize) <= (file.usage === "image" ? imageByteLimit : audioByteLimit) &&
    (file.usage === "audio" ? file.mimeType.startsWith("audio/") && Number.isSafeInteger(file.durationMs) && Number(file.durationMs) > 0 :
      ["image/png", "image/jpeg", "image/webp"].includes(file.mimeType) && file.durationMs === null);
}
