/**
 * @file decode-audio.ts
 * @brief Vérification d'un fichier audio envoyé.
 *
 * @details Trois contrôles sont enchaînés. 1) ffprobe analyse le fichier : il doit contenir
 *   exactement une piste audio, dans un format autorisé. 2) ffmpeg décode le fichier en entier, ce
 *   qui prouve qu'il est lisible jusqu'au bout et permet de mesurer sa durée réelle. 3) La durée
 *   mesurée est comparée à celle que le fichier annonce : un écart trop grand signale un fichier
 *   trafiqué.
 *
 * Pendant le décodage, ffmpeg fabrique aussi l'aperçu MP3 : le fichier n'est ainsi lu qu'une seule
 * fois.
 */

import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { audioByteLimit } from '../domain/limits.js'
import { DecodeFailure } from './decode-failure.js'
import { runDecoder } from './run-decoder.js'

/** @brief Crée le refus `415 unsupported_type` : ce type de fichier n'est pas pris en charge. */
const unsupportedType = () => new DecodeFailure(415, 'unsupported_type')

/**
 * @brief Formats refusés même si ffprobe sait les lire.
 * @details Ce ne sont pas de vrais fichiers audio mais des listes qui renvoient vers d'autres
 *   fichiers ou adresses (listes de lecture, flux réseau, suites d'images).
 */
const forbiddenFormats = ['hls', 'concat', 'dash', 'image2', 'image2pipe', 'sdp']

/**
 * @brief Pour chaque format reconnu, les types que le navigateur a le droit d'annoncer. Le premier
 *   de la liste est celui qui est enregistré en base.
 */
const mimeTypes: Record<string, string[]> = {
  wav: ['audio/wav', 'audio/x-wav', 'audio/wave'],
  flac: ['audio/flac', 'audio/x-flac'],
  mp3: ['audio/mpeg', 'audio/mp3'],
  aac: ['audio/aac', 'audio/x-aac'],
  mov: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'],
  ogg: ['audio/ogg', 'audio/opus'],
  matroska: ['audio/webm', 'audio/x-matroska'],
  aiff: ['audio/aiff', 'audio/x-aiff'],
  asf: ['audio/x-ms-wma'],
  amr: ['audio/amr'],
  ac3: ['audio/ac3'],
  au: ['audio/basic'],
}

/** @brief Partie de la réponse de ffprobe que le code utilise. */
type Probe = {
  /** @brief Flux du fichier, avec leur type et leur durée annoncée. */
  streams?: { codec_type?: string; duration?: string }[]
  /** @brief Conteneur du fichier, avec son nom et sa durée annoncée. */
  format?: { format_name?: string; duration?: string }
}

/**
 * @brief Analyse le fichier avec ffprobe et vérifie sa structure.
 * @param path Chemin du fichier.
 * @returns Le nom du format et la durée que le fichier annonce, en millisecondes.
 * @throws {DecodeFailure} `415 unsupported_type` si le format est interdit ou si le fichier ne
 *   contient pas exactement une piste audio.
 */
async function probeFormat(path: string) {
  const probeArgs = ['-show_streams', '-show_format', '-of', 'json', 'fd:']
  const probe: Probe = JSON.parse((await runDecoder(path, 'ffprobe', probeArgs)).text)
  const stream = probe.streams?.length === 1 ? probe.streams[0] : undefined
  if (!stream || stream.codec_type !== 'audio') {
    throw unsupportedType()
  }
  const format = String(probe.format?.format_name ?? '').split(',')[0]!
  if (!/^[a-z0-9_]+$/.test(format) || forbiddenFormats.includes(format)) {
    throw unsupportedType()
  }
  const advertisedMs = Number(stream.duration ?? probe.format?.duration) * 1000
  return { format, advertisedMs }
}

/**
 * @brief Décode tout le fichier pour mesurer sa durée réelle, et fabrique l'aperçu MP3 au passage.
 * @details Astuce de mesure : ffmpeg convertit le son dans un format brut très simple où une
 *   milliseconde occupe toujours 16 octets. Il suffit de compter les octets produits et de diviser
 *   par 16 pour obtenir la durée.
 * @param path Chemin du fichier.
 * @param format Format reconnu.
 * @param previewPath Où écrire l'aperçu MP3, s'il est demandé.
 * @returns La durée réelle en millisecondes.
 */
async function measureDuration(path: string, format: string, previewPath?: string) {
  const decodeArgs = [
    ...[
      '-nostdin',
      '-xerror',
      '-err_detect',
      'explode',
      '-threads',
      '1',
      '-f',
      format,
      '-i',
      'fd:',
    ],
    ...['-map', '0:a:0', '-threads', '1', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'],
  ]
  const decoded = await runDecoder(path, 'ffmpeg', decodeArgs, { countOnly: true, previewPath })
  return Math.round(decoded.bytes / 16)
}

/**
 * @brief Mesure la taille de l'aperçu MP3 qui vient d'être fabriqué.
 * @param previewPath Chemin de l'aperçu.
 * @returns Sa taille en octets.
 * @throws {DecodeFailure} `422 preview_too_large` s'il est vide ou trop volumineux.
 */
async function measurePreview(previewPath: string): Promise<number> {
  const preview = await open(previewPath, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const { size } = await preview.stat()
    if (!size || size > audioByteLimit) {
      throw new DecodeFailure(422, 'preview_too_large')
    }
    return size
  } finally {
    await preview.close()
  }
}

/**
 * @brief Vérifie entièrement un fichier audio.
 * @param path Chemin du fichier.
 * @param declaredMime Type annoncé par le navigateur lors de l'envoi.
 * @param previewPath Où écrire l'aperçu MP3.
 * @returns La nature (`audio`), le type retenu, la durée réelle et la taille de l'aperçu.
 * @throws {DecodeFailure} `415 unsupported_type` si le format n'est pas accepté ; `415
 *   mime_mismatch` si le type annoncé ne correspond pas au format ; `415 invalid_duration` si la
 *   durée réelle est trop éloignée de la durée annoncée.
 */
export async function decodeAudio(path: string, declaredMime: string, previewPath?: string) {
  const isGeneric = declaredMime === 'application/octet-stream'
  if (!declaredMime.startsWith('audio/') && !isGeneric) {
    throw unsupportedType()
  }
  const { format, advertisedMs } = await probeFormat(path)
  const accepted = mimeTypes[format] ?? [`audio/x-${format}`]
  if (!isGeneric && !accepted.includes(declaredMime)) {
    throw new DecodeFailure(415, 'mime_mismatch')
  }

  const durationMs = await measureDuration(path, format, previewPath)
  const tolerance = Math.max(250, advertisedMs * 0.02)
  const contradictsHeader =
    Number.isFinite(advertisedMs) && Math.abs(advertisedMs - durationMs) > tolerance
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || contradictsHeader) {
    throw new DecodeFailure(415, 'invalid_duration')
  }
  const previewByteSize = previewPath ? await measurePreview(previewPath) : undefined
  return { purpose: 'audio' as const, mimeType: accepted[0]!, durationMs, previewByteSize }
}
