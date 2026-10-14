/** Envoi privé d’audio, extraction facultative de pochette et remplacement d’image associé à un audio du compte. */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { join } from "node:path";
import { authenticateUser, uuidPattern } from "./authenticate-user.js";
import type { FileStore, FileReader, FileVariant } from "./file-definitions.js";
import { publicFile, publicCover } from "./file-definitions.js";
import type { CoverStore } from "./cover-definitions.js";
import { saveFile } from "./save-file.js";
import { saveAudioCover, cleanRetiredCovers } from "./save-audio-cover.js";
import { extractAudioCover } from "./extract-audio-cover.js";
import { receiveFile } from "./receive-file.js";
import { audioByteLimit, imageByteLimit, createFileValidator, FileError } from "./validate-file.js";

/** Un seul transfert/traitement lourd dans cette instance, audio et pochette confondus. */
let receiving = false;
/** Validation réelle des images manuelles, sous les mêmes budgets que les images extraites. */
const validate = createFileValidator();

/** Installe POST audio et les opérations de pochette ; les lectures restent dans register-file-reads. */
export function registerFileUpload(app: FastifyInstance, storageDir: string, store: FileStore, covers?: CoverStore, reads?: FileReader) {
  /** Distingue le refus de type, la corruption et la panne, sans divulguer le détail interne. */
  const errorReply = (error: unknown) => {
    const code = (error as { code?: string }).code ?? "";
    return error instanceof FileError ? error : new FileError(code.startsWith("FST_") ? (code === "FST_REQ_FILE_TOO_LARGE" ? 413 : 400) : 503, code.startsWith("FST_") ? "invalid_multipart" : "file_storage_unavailable");
  };
  /** Attache les annulations ; une fermeture normale après réponse ne détruit pas le résultat confirmé. */
  const cancellation = (request: FastifyRequest, reply: FastifyReply) => {
    const controller = new AbortController();
    /** Interrompt le transfert et les décodeurs lors d’un abandon. */
    const abort = () => controller.abort();
    /** Une fermeture avant réponse annule le travail encore en cours. */
    const disconnect = () => { if (!reply.raw.writableEnded) abort(); };
    request.raw.on("aborted", abort); reply.raw.on("close", disconnect);
    return { signal: controller.signal, cleanup: () => { request.raw.off("aborted", abort); reply.raw.off("close", disconnect); } };
  };
  app.post("/assets", { onRequest: authenticateUser }, async (request, reply) => {
    if (receiving) return reply.code(503).send({ error: "upload_busy", message: "An upload is already running. Please retry." });
    receiving = true; const current = cancellation(request, reply);
    try {
      let started = Date.now();
      const asset = await saveFile(storageDir, request.authenticatedUserId!, store, async path => {
        const mime = await receiveFile(request, path, audioByteLimit, current.signal); started = Date.now(); return mime;
      }, current.signal);
      let cover: FileVariant | null = null, warning: string | undefined;
      if (covers) {
        try {
          cover = await saveAudioCover(storageDir, asset.id, request.authenticatedUserId!, covers,
            path => extractAudioCover(join(storageDir, asset.storageKey), path, { timeMs: Math.max(0, 300_000 - (Date.now() - started)), signal: current.signal }));
        } catch { warning = "cover_unavailable"; }
      }
      return reply.code(201).send({ ...publicFile(asset), cover: cover ? publicCover(cover) : null, ...(warning ? { warning } : {}) });
    } catch (error) {
      const failure = errorReply(error); return reply.code(failure.status).send({ error: failure.code, message: "Audio upload refused or unavailable." });
    } finally { current.cleanup(); receiving = false; }
  });
  if (!covers || !reads) return;
  app.put<{ Params: { id: string } }>("/assets/:id/cover", { onRequest: authenticateUser }, async (request, reply) => {
    if (!uuidPattern.test(request.params.id)) return reply.code(400).send({ error: "invalid_request" });
    if (receiving) return reply.code(503).send({ error: "upload_busy" });
    receiving = true; const current = cancellation(request, reply);
    try {
      const asset = await reads.read(request, request.params.id.toLowerCase());
      if (!asset || asset.purpose !== "audio" || asset.state !== "ready") throw new FileError(404, "file_not_found");
      const cover = await saveAudioCover(storageDir, asset.id, request.authenticatedUserId!, covers, async path => {
        const mime = await receiveFile(request, path, imageByteLimit, current.signal);
        const image = await validate(path, mime, { signal: current.signal });
        if (image.purpose !== "image") throw new FileError(415, "image_required");
        if (current.signal.aborted) throw new FileError(400, "upload_aborted");
        return image;
      });
      // Une panne de nettoyage conserve ses traces retirées ; l’association est déjà confirmée.
      await cleanRetiredCovers(storageDir, covers).catch(error => request.log.error(error, "Deferred cover cleanup"));
      return reply.send({ cover: publicCover(cover!) });
    } catch (error) { const failure = errorReply(error); return reply.code(failure.status).send({ error: failure.code, message: "Cover update refused or unavailable." }); }
    finally { current.cleanup(); receiving = false; }
  });
  app.delete<{ Params: { id: string } }>("/assets/:id/cover", { onRequest: authenticateUser }, async (request, reply) => {
    if (!uuidPattern.test(request.params.id)) return reply.code(400).send({ error: "invalid_request" });
    try {
      await covers.remove(request.params.id.toLowerCase(), request.authenticatedUserId!);
      await cleanRetiredCovers(storageDir, covers).catch(error => request.log.error(error, "Deferred cover cleanup"));
      return reply.code(204).send();
    } catch (error) { const failure = errorReply(error); return reply.code(failure.status).send({ error: failure.code }); }
  });
}
