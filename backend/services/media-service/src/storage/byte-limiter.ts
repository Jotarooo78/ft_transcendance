/**
 * @file byte-limiter.ts
 * @brief Contrôle de la taille d'un fichier pendant sa réception.
 *
 * @details Un fichier arrive par petits blocs. Plutôt que d'attendre la fin pour constater qu'il
 *   est trop gros, on compte les octets au fur et à mesure et on coupe la réception dès que la
 *   limite est franchie.
 */

import { Transform } from 'node:stream'
import { fileError } from '../domain/errors.js'
import {
  audioByteLimit,
  detectImageFormat,
  imageByteLimit,
  signatureLength,
} from '../domain/limits.js'

/**
 * @brief Crée un compteur à placer entre la requête et le fichier en cours d'écriture.
 * @details La limite dépend de la nature du fichier, reconnue à ses 12 premiers octets : 25 Mo pour
 *   une image, 500 Mo pour un audio.
 * @returns Le compteur ; il interrompt la réception avec `413 file_too_large` en cas de
 *   dépassement.
 */
export function createByteLimiter(maximum = audioByteLimit): Transform {
  let received = 0
  let header = Buffer.alloc(0)
  let limit = maximum

  return new Transform({
    /**
     * @brief Traite un bloc d'octets reçu : le compte, reconnaît une image à ses 12 premiers
     *   octets, et refuse le bloc qui fait dépasser la limite.
     * @param chunk Bloc d'octets reçu.
     * @param _encoding Encodage du texte ; inutilisé ici puisqu'on reçoit des octets.
     * @param callback Fonction à appeler avec une erreur pour interrompre la réception, ou avec le
     *   bloc pour le laisser passer.
     */
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      if (header.length < signatureLength) {
        const missing = signatureLength - header.length
        header = Buffer.concat([header, chunk.subarray(0, missing)])
        if (header.length >= signatureLength && detectImageFormat(header)) {
          limit = Math.min(maximum, imageByteLimit)
        }
      }
      callback(received > limit ? fileError(413, 'file_too_large') : null, chunk)
    },
  })
}
