/** Route JWT de suppression privée ; la liste cliente ne doit changer qu’après la confirmation 204. */
import type { FastifyInstance } from "fastify";
import { authenticateUser, uuidPattern } from "./authenticate-user.js";
import { deleteFile } from "./delete-file.js";
import type { FileDeletion } from "./file-definitions.js";
import { FileError } from "./validate-file.js";

/**
 * Ajoute DELETE /assets/:id et traduit les refus métier : absence ou autre propriétaire, fichier
 * utilisé et service indisponible.
 */
export function registerFileDeletion(app: FastifyInstance, storageDir: string, files: FileDeletion) {
  app.delete<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>("/assets/:id", { onRequest: authenticateUser }, async (request, reply) => {
    if (!uuidPattern.test(request.params.id)) return reply.code(400).send({ error: "invalid_request", message: "Identifiant invalide." });
    try { await deleteFile(storageDir, files, request, request.params.id.toLowerCase()); return reply.code(204).send(); }
    catch (error) {
      const failure = error instanceof FileError ? error : new FileError(503, "file_deletion_unavailable");
      return reply.code(failure.status).send({ error: failure.code, message: failure.status === 409 ? "Ce fichier est encore utilisé dans le catalogue." : "Suppression indisponible. Réessayez." });
    }
  });
}
