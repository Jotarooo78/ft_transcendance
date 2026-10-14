/** Reçoit exactement un fichier multipart en flux borné dans une cible temporaire contrôlée par Media. */
import type { FastifyRequest } from "fastify";
import { createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { FileError } from "./validate-file.js";

/** Refuse champs et fichiers supplémentaires, compte les octets réels et synchronise le fichier complet. */
export async function receiveFile(request: FastifyRequest, path: string, maximum: number, signal: AbortSignal) {
  let count = 0, mime = "";
  for await (const part of request.parts({ limits: { files: 1, fields: 0, parts: 1, fileSize: maximum + 1, headerPairs: 32 } })) {
    if (part.type !== "file" || part.fieldname !== "file" || ++count !== 1) throw new FileError(400, "invalid_multipart");
    mime = part.mimetype; let bytes = 0;
    const bound = new Transform({
      /** Arrête le transfert dès que la limite propre à l’audio ou à la pochette est dépassée. */
      transform(chunk: Buffer, _encoding, callback) { bytes += chunk.length; callback(bytes > maximum ? new FileError(413, "file_too_large") : null, chunk); },
    });
    await pipeline(part.file, bound, createWriteStream(path, { flags: "wx", mode: 0o600 }), { signal });
    const file = await open(path, "r"); try { await file.sync(); } finally { await file.close(); }
    if (part.file.truncated) throw new FileError(413, "file_too_large");
  }
  if (count !== 1) throw new FileError(400, "file_required");
  return mime;
}
