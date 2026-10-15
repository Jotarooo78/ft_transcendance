/** Adapte les requêtes de pochette, leur annulation et leurs réponses HTTP. */
import type { FastifyRequest, FastifyReply } from 'fastify'
import { uploadBusy } from '../domain/errors.js'
import { imageByteLimit } from '../domain/limits.js'
import type { CoversService } from '../services/covers.service.js'
import type { UploadGate } from '../services/upload-gate.js'
import { receiveSingleFile } from './receive-upload.js'
import { sendFile } from './send-file.js'
/** Identifiant déjà validé par le schéma de route. */
type Request = FastifyRequest<{ Params: { id: string } }>
/** Partage la limite de concurrence avec l’envoi audio ; ne cache pas les échecs de modification. */
export function createCoversController(covers: CoversService, gate: UploadGate) {
  return {
    /** Reçoit une image sous limite stricte et interrompt le traitement si la connexion ferme. */
    async replace(request: Request, reply: FastifyReply) {
      if (!gate.tryEnter()) throw uploadBusy()
      const controller = new AbortController()
      /** Annule la réception et le décodeur lorsque la requête est abandonnée. */
      const abort = () => controller.abort()
      /** Une fermeture normale après réponse conserve le résultat confirmé. */
      const close = () => {
        if (!reply.raw.writableEnded) abort()
      }
      request.raw.on('aborted', abort)
      reply.raw.on('close', close)
      try {
        const result = await covers.replace(
          request.userId,
          request.params.id.toLowerCase(),
          (path) => receiveSingleFile(request, path, controller.signal, imageByteLimit),
          controller.signal
        )
        await covers.cleanup().catch((error) => request.log.error(error, 'Deferred cover cleanup'))
        return result
      } finally {
        gate.leave()
        request.raw.off('aborted', abort)
        reply.raw.off('close', close)
      }
    },
    /** Confirme le retrait même si le nettoyage disque doit être repris au redémarrage. */
    async remove(request: Request, reply: FastifyReply) {
      await covers.remove(request.userId, request.params.id.toLowerCase())
      await covers.cleanup().catch((error) => request.log.error(error, 'Deferred cover cleanup'))
      return reply.code(204).send()
    },
    /** Sert la pochette privée après contrôle du compte. */
    async privateRead(request: Request, reply: FastifyReply) {
      reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff')
      return sendFile(
        request,
        reply,
        await covers.open(request.params.id.toLowerCase(), request.userId)
      )
    },
    /** Sert la pochette publique après vérification de publication dans Catalogue. */
    async publicRead(request: Request, reply: FastifyReply) {
      reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff')
      return sendFile(request, reply, await covers.open(request.params.id.toLowerCase()))
    },
  }
}
