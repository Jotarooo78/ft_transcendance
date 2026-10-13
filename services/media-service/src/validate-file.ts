/** Validation isolée des vrais octets : budgets de durée et de mémoire, annulation et résultat contrôlé avant stockage. */
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, readFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Limite audio : 500 000 000 octets, soit 500 Mo décimaux ; contrôle client et serveur cohérent. */
export const audioByteLimit = 500_000_000;
/** Limite image : 25 000 000 octets, soit 25 Mo décimaux ; indépendante du plafond audio. */
export const imageByteLimit = 25_000_000;
/**
 * Métadonnées issues du décodage complet ; taille en octets, durée en millisecondes et empreinte
 * SHA-256 de l’original.
 */
export type ValidatedFile = {
  /** Usage interne Media ; audio et cover représentent les uploads gérés ici. */
  purpose: "audio" | "image";
    /** Type MIME du contenu vérifié, utilisé pour servir les octets avec leur format. */
    mimeType: string;
    /** Taille exacte de l’original ou de la variante en octets, pas en mégaoctets. */
    byteSize: number;
  /**
   * Empreinte SHA-256 de l’original ; sert à contrôler l’identité des octets, pas à partager le
   * stockage.
   */
  checksumSha256: string;
    /** Durée en millisecondes ; null lorsque cette durée n’est pas disponible ou ne s’applique pas. */
    durationMs: number | null;
    /** Largeur décodée de l’image en pixels. */
    width?: number;
    /** Hauteur décodée de l’image en pixels. */
    height?: number;
  /** Taille en octets de l’aperçu MP3 généré, distincte de celle de l’original. */
  previewByteSize?: number;
};
/**
 * Refus du fichier ou panne de service avec statut HTTP et code public, sans détails internes à
 * exposer au client.
 */
export class FileError extends Error {
  /** Initialise le statut et le code de refus du fichier. */
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
/** Garde locale : un seul traitement de décodage simultané, même entre plusieurs validateurs créés. */
let busy = false;

// Linux /proc includes the isolated JS worker and every decoder descendant.
/**
 * Additionne la mémoire résidente du processus Linux et de ses descendants via /proc. Renvoie zéro
 * pour un processus terminé ; propage une erreur de lecture inattendue.
 */
async function residentBytes(pid: number): Promise<number> {
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    const children = await readFile(`/proc/${pid}/task/${pid}/children`, "utf8");
    const own = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) * 1024;
    const descendants = await Promise.all(children.trim().split(/\s+/).filter(Boolean).map(value => residentBytes(Number(value))));
    return own + descendants.reduce((sum, value) => sum + value, 0);
  } catch (error) {
    if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) return 0;
    throw error;
  }
}

/**
 * Construit un validateur exécutant un seul traitement lourd à la fois dans cette instance. Décode
 * dans un processus séparé avec annulation et budgets communs à la validation et à l’aperçu. Le
 * contrôle mémoire est échantillonné toutes les 20 ms, avec dépassement bref possible entre mesures.
 * @returns Fonction recevant le chemin temporaire, le MIME déclaré et des limites facultatives ;
 * résout les métadonnées validées ou rejette FileError.
 */
export function createFileValidator() {
  return async (path: string, declaredMime: string, limits?: {
    /** Budget total de traitement en millisecondes ; ne peut pas augmenter la limite du format. */
    timeMs?: number;
    /** Budget mémoire suivi pour le processus et ses descendants, en octets. */
    memoryBytes?: number;
    /** Signal d’annulation propagé au transfert ou au traitement. */
    signal?: AbortSignal;
    /** Chemin temporaire de l’aperçu à produire sous le même budget que la validation. */
    previewPath?: string }): Promise<ValidatedFile> => {
    if (busy) throw new FileError(503, "decoder_busy");
    if (process.platform !== "linux") throw new FileError(503, "decoder_unavailable");
    busy = true;
    try {
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let image = false;
      try {
        const stat = await file.stat();
        if (!stat.isFile()) throw new FileError(415, "invalid_file");
        if (!stat.size) throw new FileError(400, "empty_file");
        if (stat.size > audioByteLimit) throw new FileError(413, "file_too_large");
        const header = Buffer.alloc(12);
        await file.read(header, 0, header.length, 0);
        image = header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
          (header[0] === 255 && header[1] === 216) || (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP");
        if (image && stat.size > imageByteLimit) throw new FileError(413, "file_too_large");
      } finally { await file.close(); }
      const timeMs = Math.min(limits?.timeMs ?? Infinity, image ? 30_000 : 300_000);
      const memoryBytes = Math.min(limits?.memoryBytes ?? Infinity, image ? 268_435_456 : 536_870_912);
      return await new Promise<ValidatedFile>((resolve, reject) => {
        const worker = spawn(process.execPath, ["--max-old-space-size=64", fileURLToPath(new URL("./decode-file.js", import.meta.url)), path, declaredMime, limits?.previewPath ?? ""],
          { detached: true, stdio: ["ignore", "pipe", "ignore"], env: { PATH: process.env.PATH, NODE_ENV: "production" } });
        let output = ""; let failure: FileError | undefined; let finished = false; let inspecting = false;
        /** Mémorise le premier refus puis tue tout le groupe du décodeur pour arrêter aussi ses sous-processus. */
        const stop = (error: FileError) => {
          failure ??= error;
          if (worker.pid) { try { process.kill(-worker.pid, "SIGKILL"); } catch { /* already exited */ } }
        };
        /** Transforme l’annulation de l’upload en arrêt du groupe de traitement. */
        const abort = () => stop(new FileError(400, "upload_aborted"));
        const timer = setTimeout(() => stop(new FileError(422, "processing_limit")), timeMs);
        const monitor = setInterval(async () => {
          if (finished || inspecting || !worker.pid) return;
          inspecting = true;
          try {
            if (await residentBytes(worker.pid) > memoryBytes && !finished) stop(new FileError(422, "processing_limit"));
            if (limits?.previewPath) {
              const preview = await lstat(limits.previewPath).catch(error => { if (error.code === "ENOENT") return null; throw error; });
              if (preview && preview.size > audioByteLimit && !finished) stop(new FileError(422, "preview_too_large"));
            }
          }
          catch { if (!finished) stop(new FileError(503, "decoder_unavailable")); }
          finally { inspecting = false; }
        }, 20);
        limits?.signal?.addEventListener("abort", abort, { once: true });
        if (limits?.signal?.aborted) abort();
        worker.stdout.on("data", chunk => { output += String(chunk); if (output.length > 8192) stop(new FileError(415, "invalid_file")); });
        worker.on("error", () => { failure = new FileError(503, "decoder_unavailable"); });
        worker.on("close", () => {
          finished = true; clearTimeout(timer); clearInterval(monitor); limits?.signal?.removeEventListener("abort", abort);
          if (failure) return reject(failure);
          try {
            const result = JSON.parse(output);
            if (result.error) return reject(new FileError(result.status, result.error));
            if (!Number.isSafeInteger(result.byteSize) || !/^[a-f0-9]{64}$/.test(result.checksumSha256)) throw new Error("Invalid result");
            resolve(result);
          } catch { reject(new FileError(415, "invalid_file")); }
        });
      });
    } catch (error) { if (error instanceof FileError) throw error; throw new FileError(503, "storage_unavailable"); }
    finally { busy = false; }
  };
}
