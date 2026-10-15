/** Extrait une image intégrée dans un fichier audio déjà validé, avec budgets bornés et validation image indépendante. */
import { spawn } from 'node:child_process'
import { constants, createWriteStream } from 'node:fs'
import { open, unlink } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DomainError as FileError } from '@ft/service-kit'
import { createFileValidator } from './validate-file.js'
import { residentBytes } from './process-memory.js'
import { imageByteLimit } from '../domain/limits.js'
import type { ValidatedFile } from '../domain/file.js'

/** Images décrites par FFprobe ; seules les pistes attached_pic peuvent devenir des pochettes. */
type Picture = {
  /** Numéro de piste dans le fichier ; utilisé pour sélectionner précisément les octets. */
  index: number
  /** Type de piste décrit par le décodeur. */
  codec_type?: string
  /** Indicateurs du conteneur pour une image attachée. */
  disposition?: { attached_pic?: number }
  /** Texte ID3 éventuel identifiant notamment la couverture avant. */
  tags?: { comment?: string; title?: string }
}

/** Bornes communes au sondage, à l’extraction et au décodage image ; elles ne sont pas remises à zéro par processus. */
export type CoverLimits = {
  /** Temps maximal facultatif en millisecondes, au plus 30 secondes. */
  timeMs?: number
  /** Mémoire résidente maximale des processus du traitement, au plus 256 Mio. */
  memoryBytes?: number
  /** Annulation de la demande ; le groupe de processus est arrêté. */
  signal?: AbortSignal
}

/**
 * Sonde ou copie une piste par un descripteur local : aucun protocole réseau ou chemin externe n’est autorisé.
 * La sortie texte est bornée à 1 Mio ; la sortie image est écrite en flux borné, sans écraser une cible existante.
 */
async function run(
  inputPath: string,
  command: string,
  args: string[],
  deadline: number,
  memory: number,
  signal?: AbortSignal,
  outputPath?: string
): Promise<string> {
  if (signal?.aborted) throw new FileError(400, 'upload_aborted')
  if (Date.now() >= deadline) throw new FileError(422, 'processing_limit')
  const input = await open(
    inputPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  )
  let output: Awaited<ReturnType<typeof open>> | undefined
  let installed = false
  try {
    if (!(await input.stat()).isFile()) throw new FileError(415, 'invalid_file')
    if (outputPath) {
      output = await open(outputPath, 'wx', 0o600)
      installed = true
    }
    const child = spawn(
      command,
      ['-v', 'error', '-protocol_whitelist', 'fd', '-fd', '3', ...args],
      { detached: true, stdio: ['ignore', 'pipe', 'ignore', input.fd] }
    )
    let failure: FileError | undefined
    let bytes = 0
    let text = ''
    let monitoring = false
    /** Arrête ce traitement et ses enfants en conservant la première raison publique du refus. */
    const stop = (error: FileError) => {
      failure ??= error
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          /* Le processus peut être déjà terminé. */
        }
      }
    }
    /** Interrompt l’extraction quand la requête privée est annulée. */
    const abort = () => stop(new FileError(400, 'upload_aborted'))
    const timer = setTimeout(
      () => stop(new FileError(422, 'processing_limit')),
      Math.max(1, deadline - Date.now())
    )
    const monitor = setInterval(async () => {
      if (monitoring || !child.pid) return
      monitoring = true
      try {
        if ((await residentBytes(child.pid)) > memory) stop(new FileError(422, 'processing_limit'))
      } catch {
        stop(new FileError(503, 'decoder_unavailable'))
      } finally {
        monitoring = false
      }
    }, 20)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const bounded = new Transform({
      /** Compte les octets du processus avant écriture ; bloque un résultat démesuré. */
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length
        if (bytes > (output ? imageByteLimit : 1_048_576)) {
          const error = new FileError(422, 'cover_too_large')
          stop(error)
          callback(error)
          return
        }
        if (!output) text += chunk.toString()
        callback(null, output ? chunk : undefined)
      },
    })
    const closed = new Promise<void>((resolve, reject) => {
      child.on('error', () => {
        stop(new FileError(503, 'decoder_unavailable'))
        reject(failure)
      })
      child.on('close', (code) =>
        code === 0 && !failure
          ? resolve()
          : reject(failure ?? new FileError(415, 'cover_unavailable'))
      )
    })
    try {
      // Les deux promesses sont observées immédiatement, y compris quand le codec échoue tôt.
      const streamed = output
        ? pipeline(
            child.stdout!,
            bounded,
            createWriteStream(outputPath!, { fd: output.fd, autoClose: false, emitClose: false })
          )
        : pipeline(child.stdout!, bounded)
      const results = await Promise.allSettled([closed, streamed])
      const rejected = results.find((result) => result.status === 'rejected')
      if (rejected?.status === 'rejected') throw rejected.reason
      await output?.sync()
      return text
    } finally {
      clearTimeout(timer)
      clearInterval(monitor)
      signal?.removeEventListener('abort', abort)
    }
  } catch (error) {
    if (installed && outputPath) await unlink(outputPath).catch(() => {})
    throw error
  } finally {
    await input.close()
    await output?.close()
  }
}

/**
 * Retourne null pour un audio sans image intégrée ; sinon écrit et valide une pochette sous la cible temporaire.
 * Examine au plus quatre images, en préférant une couverture avant déclarée ; un échec doit être traité comme facultatif par l’appelant.
 * @throws FileError pour image inexploitable, budget dépassé ou demande annulée ; l’original n’est jamais modifié.
 */
export async function extractAudioCover(
  inputPath: string,
  outputPath: string,
  limits: CoverLimits = {}
): Promise<ValidatedFile | null> {
  const deadline = Date.now() + Math.min(limits.timeMs ?? 30_000, 30_000)
  const memory = Math.min(limits.memoryBytes ?? 268_435_456, 268_435_456)
  const probe = JSON.parse(
    await run(
      inputPath,
      'ffprobe',
      ['-show_streams', '-select_streams', 'v', '-of', 'json', 'fd:'],
      deadline,
      memory,
      limits.signal
    )
  )
  if (!Array.isArray(probe.streams)) throw new FileError(415, 'cover_unavailable')
  const pictures = (probe.streams as Picture[]).filter(
    (picture) =>
      picture.codec_type === 'video' &&
      picture.disposition?.attached_pic === 1 &&
      Number.isInteger(picture.index)
  )
  if (!pictures.length) return null
  /** Donne la priorité à la couverture avant ID3, puis conserve l’ordre des pistes. */
  const front = (picture: Picture) =>
    /front/i.test(`${picture.tags?.comment ?? ''} ${picture.tags?.title ?? ''}`) ? 0 : 1
  pictures.sort((a, b) => front(a) - front(b) || a.index - b.index)
  const validate = createFileValidator()
  for (const picture of pictures.slice(0, 4)) {
    try {
      await run(
        inputPath,
        'ffmpeg',
        [
          '-nostdin',
          '-threads',
          '1',
          '-i',
          'fd:',
          '-map',
          `0:${picture.index}`,
          '-frames:v',
          '1',
          '-c:v',
          'copy',
          '-f',
          'image2pipe',
          'pipe:1',
        ],
        deadline,
        memory,
        limits.signal,
        outputPath
      )
      const file = await validate(outputPath, 'application/octet-stream', {
        timeMs: Math.max(1, deadline - Date.now()),
        memoryBytes: memory,
        signal: limits.signal,
      })
      if (file.purpose !== 'image') throw new FileError(415, 'cover_unavailable')
      return file
    } catch (error) {
      if (!(error instanceof FileError)) throw error
      await unlink(outputPath).catch(() => {})
      if (error.status !== 415 && error.code !== 'image_dimensions') throw error
    }
  }
  throw new FileError(415, 'cover_unavailable')
}
