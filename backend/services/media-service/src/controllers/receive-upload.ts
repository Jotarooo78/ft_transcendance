/**
 * @file receive-upload.ts
 * @brief Réception du formulaire par lequel le navigateur envoie un fichier.
 *
 * @details Un fichier n'arrive pas en JSON mais dans un formulaire d'un format particulier, appelé
 *   « multipart ». Ce fichier lit ce formulaire, qui doit contenir exactement un fichier et rien
 *   d'autre, et écrit le fichier sur le disque au fur et à mesure qu'il arrive, sans jamais le
 *   garder entier en mémoire.
 */

import '@fastify/multipart'
import type { FastifyRequest } from 'fastify'
import { createWriteStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { fileError } from '../domain/errors.js'
import { audioByteLimit } from '../domain/limits.js'
import { createByteLimiter } from '../storage/byte-limiter.js'

/** @brief Limites imposées au formulaire : un seul fichier, aucun autre champ. */
const partLimits = { files: 1, fields: 0, parts: 1, fileSize: audioByteLimit + 1, headerPairs: 32 }
/**
 * @brief Crée le refus `400 invalid_multipart` : le formulaire est mal formé ou contient autre
 *   chose qu'un unique fichier.
 */
const invalidMultipart = () => fileError(400, 'invalid_multipart')

/**
 * @brief Demande au système d'écrire réellement un fichier sur le disque, pour qu'il survive à une
 *   coupure de courant.
 * @param path Chemin du fichier.
 */
async function syncFile(path: string): Promise<void> {
  const file = await open(path, 'r')
  try {
    await file.sync()
  } finally {
    await file.close()
  }
}

/**
 * @brief Écrit sur le disque l'unique fichier contenu dans le formulaire.
 * @param request Requête contenant le formulaire.
 * @param path Endroit où écrire le fichier ; aucun fichier ne doit déjà s'y trouver.
 * @param signal Signal qui se déclenche si l'utilisateur annule son envoi.
 * @returns Le type de fichier annoncé par le navigateur.
 * @throws {DomainError} `400 invalid_multipart` si le formulaire est incorrect ; `400
 *   file_required` s'il ne contient pas de fichier ; `413 file_too_large` si le fichier dépasse la
 *   taille maximale.
 */
export async function receiveSingleFile(
  request: FastifyRequest,
  path: string,
  signal: AbortSignal,
  byteLimit = audioByteLimit
): Promise<string> {
  let count = 0
  let declaredMime = ''
  for await (const part of request.parts({ limits: { ...partLimits, fileSize: byteLimit + 1 } })) {
    if (part.type !== 'file' || part.fieldname !== 'file' || ++count !== 1) {
      throw invalidMultipart()
    }
    declaredMime = part.mimetype
    const destination = createWriteStream(path, { flags: 'wx', mode: 0o600 })
    await pipeline(part.file, createByteLimiter(byteLimit), destination, { signal })
    await syncFile(path)
    if (part.file.truncated) {
      throw fileError(413, 'file_too_large')
    }
  }
  if (count !== 1) {
    throw fileError(400, 'file_required')
  }
  return declaredMime
}
