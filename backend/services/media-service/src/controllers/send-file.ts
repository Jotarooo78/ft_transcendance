/**
 * @file send-file.ts
 * @brief Envoi d'un fichier du disque dans une réponse HTTP.
 *
 * @details Fonction commune à l'écoute publique et à l'aperçu privé. Le fichier est envoyé par
 *   blocs, directement du disque vers le réseau, sans être chargé entier en mémoire.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ByteRange } from '../domain/byte-range.js'
import type { ReadableFile } from '../services/files.service.js'

/**
 * @brief Envoie un fichier au client, en entier ou en partie.
 * @param request Requête reçue. Pour une requête `HEAD`, seuls les en-têtes (type, taille) sont
 *   envoyés, sans le contenu.
 * @param reply Réponse à remplir.
 * @param file Fichier déjà ouvert ; il est refermé dans tous les cas, même en cas d'erreur.
 * @param range Partie à envoyer, ou rien pour envoyer le fichier entier.
 */
export async function sendFile(
  request: FastifyRequest,
  reply: FastifyReply,
  file: ReadableFile,
  range?: ByteRange
) {
  const length = range ? range.end - range.start + 1 : file.size
  reply.header('Content-Type', file.mimeType).header('Content-Length', length)
  if (request.method === 'HEAD') {
    await file.handle.close()
    return reply.send()
  }
  const stream = file.handle.createReadStream(range)
  // Une connexion fermée par le client arrête la lecture du disque.
  reply.raw.on('close', () => stream.destroy())
  return reply.send(stream)
}
