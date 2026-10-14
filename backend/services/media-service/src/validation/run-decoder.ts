/**
 * @file run-decoder.ts
 * @brief Lancement des outils ffprobe et ffmpeg sur un fichier.
 *
 * @details ffmpeg est un programme externe très répandu qui sait lire et convertir presque tous les
 *   formats audio et vidéo. ffprobe, livré avec lui, se contente d'analyser un fichier et d'en
 *   décrire le contenu. Les deux sont installés dans l'image Docker du service.
 *
 * Faire lire un fichier inconnu à ffmpeg comporte un risque : certains formats peuvent contenir des
 * références à d'autres fichiers ou à des adresses réseau. Ce fichier lance donc ffmpeg avec des
 * options qui lui interdisent de lire autre chose que le fichier fourni.
 */

import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { DecodeFailure, invalidFile } from './decode-failure.js'

/**
 * @brief Ce qu'un outil a produit : le texte qu'il a affiché et le nombre d'octets qu'il a écrits.
 */
export type DecoderOutput = {
  /** @brief Sortie texte du sondage ; vide quand la sortie est seulement comptée. */
  text: string
  /** @brief Nombre d'octets produits sur la sortie standard. */
  bytes: number
}

/** @brief Options de lancement : faut-il compter les octets produits, et où écrire l'aperçu MP3. */
type DecoderOptions = {
  /** @brief Compte la sortie au lieu de la conserver : le PCM décodé ne tient pas en mémoire. */
  countOnly?: boolean
  /** @brief Fichier où écrire l'aperçu MP3, produit pendant le même décodage. */
  previewPath?: string
}

/**
 * @brief Quantité maximale de texte gardée de la sortie d'un outil : 1 Mio. Le surplus est ignoré.
 */
const maxTextLength = 1_048_576
/** @brief Quantité maximale de messages d'erreur gardée. */
const maxErrorLength = 8192
/**
 * @brief Options passées à ffmpeg pour qu'il produise en même temps l'aperçu MP3 (stéréo, 128
 *   kbit/s).
 */
const previewArgs = [
  ...['-map', '0:a:0', '-threads', '1', '-c:a', 'libmp3lame', '-b:a', '128k'],
  ...['-ar', '44100', '-ac', '2', '-f', 'mp3', 'pipe:4'],
]

/**
 * @brief Lance ffprobe ou ffmpeg sur un fichier et attend la fin.
 * @details Le fichier est ouvert par notre code puis transmis à l'outil déjà ouvert, sous forme de
 *   « descripteur » ; l'outil n'a le droit d'utiliser que ce descripteur. Un fichier piégé ne peut
 *   donc lui faire lire ni le réseau, ni un autre fichier du disque.
 * @param path Chemin du fichier à lire.
 * @param command Outil à lancer : `ffprobe` ou `ffmpeg`.
 * @param args Options propres à l'opération demandée.
 * @param options Comptage des octets produits et chemin de l'aperçu à écrire.
 * @returns Le texte affiché par l'outil et le nombre d'octets produits.
 * @throws {DecodeFailure} `415 invalid_file` si l'outil échoue ou signale une erreur dans le
 *   fichier ; `503 decoder_unavailable` si l'outil ne peut pas être lancé.
 */
export async function runDecoder(
  path: string,
  command: string,
  args: string[],
  { countOnly = false, previewPath }: DecoderOptions = {}
): Promise<DecoderOutput> {
  const openFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  const file = await open(path, openFlags)
  const preview = previewPath ? await open(previewPath, 'wx', 0o600) : undefined
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(
        command,
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'fd',
          '-fd',
          '3',
          ...args,
          ...(preview ? previewArgs : []),
        ],
        { stdio: ['ignore', 'pipe', 'pipe', file.fd, ...(preview ? [preview.fd] : [])] }
      )
      const output = { text: '', bytes: 0 }
      let errors = ''
      let overflow = false

      child.stdout!.on('data', (chunk: Buffer) => {
        output.bytes += chunk.length
        if (countOnly) {
          return
        }
        output.text += chunk.toString()
        if (output.text.length > maxTextLength) {
          overflow = true
          child.kill('SIGKILL')
        }
      })
      child.stderr!.on('data', (chunk) => {
        if (errors.length < maxErrorLength) {
          errors += String(chunk)
        }
      })
      child.on('error', () => reject(new DecodeFailure(503, 'decoder_unavailable')))
      child.on('close', (code) => {
        const succeeded = code === 0 && !errors && !overflow
        return succeeded ? resolve(output) : reject(invalidFile())
      })
    })
  } finally {
    await file.close()
    await preview?.sync()
    await preview?.close()
  }
}
