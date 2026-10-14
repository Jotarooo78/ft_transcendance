/**
 * @file decode-file.ts
 * @brief Programme de décodage isolé : un petit programme séparé du serveur, lancé pour chaque
 *   fichier à vérifier.
 *
 * @details Pourquoi un programme séparé ? Décoder un fichier inconnu est l'opération la plus
 *   risquée du service : un fichier conçu pour cela peut consommer énormément de mémoire ou tourner
 *   indéfiniment. En le décodant dans un programme à part, le serveur peut le surveiller et
 *   l'arrêter de force sans être lui-même touché.
 *
 * Ce fichier n'est pas importé par le serveur : il est lancé comme une commande par
 * validation/decode-supervisor.ts. Il reçoit trois arguments (chemin du fichier, type annoncé,
 * chemin de l'aperçu à écrire) et affiche un unique objet JSON : soit les informations du fichier,
 * soit `{ error, status }` en cas de refus.
 */

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import {
  audioByteLimit,
  detectImageFormat,
  imageByteLimit,
  signatureLength,
} from '../domain/limits.js'
import { decodeAudio } from './decode-audio.js'
import { DecodeFailure, invalidFile } from './decode-failure.js'
import { decodeImage } from './decode-image.js'

// Point d'entrée du processus de décodage isolé, lancé par validate-file.ts sous un budget de
// temps et de mémoire. Il écrit un seul objet JSON sur sa sortie standard.

/** @brief Chemin du fichier à vérifier : premier argument du programme. */
const path = process.argv[2]!
/**
 * @brief Type annoncé par le navigateur : deuxième argument, mis en minuscules et débarrassé de ses
 *   paramètres éventuels.
 */
const declaredMime = process.argv[3]!.split(';', 1)[0]!.trim().toLowerCase()
/** @brief Chemin où écrire l'aperçu MP3 : troisième argument, facultatif. */
const previewPath = process.argv[4] || undefined

/**
 * @brief Lit la taille du fichier, ses premiers octets et son empreinte, sans le modifier.
 * @details L'empreinte (SHA-256) est une suite de caractères calculée à partir du contenu : deux
 *   fichiers identiques ont la même.
 * @returns La taille, les premiers octets et l'empreinte.
 * @throws {DecodeFailure} `415 invalid_file` si ce n'est pas un fichier ordinaire, `400 empty_file`
 *   s'il est vide, `413 file_too_large` s'il dépasse la taille maximale.
 */
async function inspect() {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await file.stat()
    if (!stat.isFile()) {
      throw invalidFile()
    }
    if (!stat.size) {
      throw new DecodeFailure(400, 'empty_file')
    }
    if (stat.size > audioByteLimit) {
      throw new DecodeFailure(413, 'file_too_large')
    }
    const header = Buffer.alloc(signatureLength)
    await file.read(header, 0, signatureLength, 0)
    const hash = createHash('sha256')
    for await (const chunk of file.createReadStream({ start: 0, autoClose: false })) {
      hash.update(chunk)
    }
    return { byteSize: stat.size, header, checksumSha256: hash.digest('hex') }
  } finally {
    await file.close()
  }
}

/**
 * @brief Vérifie le fichier comme une image ou comme un audio, selon ce que montrent ses premiers
 *   octets.
 * @returns Toutes les informations établies sur le fichier.
 */
async function decode() {
  const { byteSize, header, checksumSha256 } = await inspect()
  const imageFormat = detectImageFormat(header)
  if (imageFormat && byteSize > imageByteLimit) {
    throw new DecodeFailure(413, 'file_too_large')
  }
  const content = imageFormat
    ? await decodeImage(path, imageFormat, declaredMime)
    : await decodeAudio(path, declaredMime, previewPath)
  return { byteSize, checksumSha256, ...content }
}

try {
  process.stdout.write(JSON.stringify(await decode()))
} catch (error) {
  const failure = error instanceof DecodeFailure ? error : invalidFile()
  process.stdout.write(JSON.stringify({ error: failure.code, status: failure.status }))
}
