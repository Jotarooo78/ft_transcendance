/** Route multipart privée : le JWT est vérifié avant de recevoir les octets, puis le stockage confirme seul le succès. */
import type { FastifyInstance } from "fastify";
import { createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { authenticateUser } from "./authenticate-user.js";
import type { FileStore } from "./file-definitions.js";
import { publicFile } from "./file-definitions.js";
import { saveFile } from "./save-file.js";
import { audioByteLimit, imageByteLimit, FileError } from "./validate-file.js";

/** Garde locale : un seul transfert lourd simultané dans cette instance Media. */
let receiving = false;
/**
 * Ajoute POST /assets : un seul champ file, un transfert à la fois, comptage réel des octets et arrêt
 * dès la limite. Confirme 201 uniquement après validation, fichiers durables et métadonnées SQL.
 */
export function registerFileUpload(app: FastifyInstance, storageDir: string, store: FileStore) {
  app.post("/assets", { onRequest: authenticateUser }, async (request, reply) => {
    if (receiving) return reply.code(503).send({ error: "upload_busy", message: "Un envoi est déjà en cours. Réessayez." });
    receiving = true;
    const controller = new AbortController(); const /** Annule le transfert et le décodage lorsqu’une interruption est signalée. */ abort = () => controller.abort();
    request.raw.on("aborted", abort);
    /**
     * Annule si la connexion se ferme avant la fin de la réponse ; une fermeture normale ne détruit pas le
     * résultat confirmé.
     */
    const disconnected = () => { if (!reply.raw.writableEnded) abort(); };
    reply.raw.on("close", disconnected);
    try {
      const asset = await saveFile(storageDir, request.authenticatedUserId!, store, async path => {
        let count = 0; let mime = "";
        for await (const part of request.parts({ limits: { files: 1, fields: 0, parts: 1, fileSize: audioByteLimit + 1, headerPairs: 32 } })) {
          if (part.type !== "file" || part.fieldname !== "file" || ++count !== 1) throw new FileError(400, "invalid_multipart");
          mime = part.mimetype;
          let bytes = 0; let header = Buffer.alloc(0); let maximum = audioByteLimit;
          const bound = new Transform({
            /** Compte les octets au fil de l’eau et reconnaît la signature image pour appliquer immédiatement sa limite plus petite. */
            transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            if (header.length < 12) header = Buffer.concat([header, chunk.subarray(0, 12 - header.length)]);
            if (header.length >= 12 && (header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
              (header[0] === 255 && header[1] === 216) || (header.toString("ascii",0,4) === "RIFF" && header.toString("ascii",8,12) === "WEBP"))) maximum = imageByteLimit;
            callback(bytes > maximum ? new FileError(413, "file_too_large") : null, chunk);
          } });
          await pipeline(part.file, bound, createWriteStream(path, { flags: "wx", mode: 0o600 }), { signal: controller.signal });
          const file = await open(path, "r");
          try { await file.sync(); } finally { await file.close(); }
          if (part.file.truncated) throw new FileError(413, "file_too_large");
        }
        if (count !== 1) throw new FileError(400, "file_required");
        return mime;
      }, controller.signal);
      return reply.code(201).send(publicFile(asset));
    } catch (error) {
      const code = (error as {
        /** Code de refus public ou code métier, distinct du message détaillé interne. */
        code?: string }).code;
      const failure = error instanceof FileError ? error : new FileError(code === "FST_REQ_FILE_TOO_LARGE" ? 413 : 400, "invalid_multipart");
      return reply.code(failure.status).send({ error: failure.code, message: "Fichier refusé ou service indisponible. Vérifiez le fichier puis réessayez." });
    } finally {
      receiving = false; request.raw.off("aborted", abort); reply.raw.off("close", disconnected);
    }
  });
}
