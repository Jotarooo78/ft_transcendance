/**
 * @file decode-supervisor.ts
 * @brief Lancement et surveillance du programme de décodage isolé.
 *
 * @details Ce fichier tourne dans le serveur. Il lance decode-file.ts comme un programme séparé,
 *   puis le surveille : s'il dure trop longtemps, utilise trop de mémoire, écrit un aperçu trop
 *   gros, ou si l'utilisateur annule son envoi, le programme et tout ce qu'il a lancé sont arrêtés
 *   de force.
 */

import { DomainError } from '@ft/service-kit'
import { spawn } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { fileError } from '../domain/errors.js'
import type { ValidatedFile } from '../domain/file.js'
import { audioByteLimit } from '../domain/limits.js'
import { residentBytes } from './process-memory.js'

/** @brief Limites accordées à un décodage : durée, mémoire, et moyen de l'annuler. */
export type DecodeBudget = {
  /** @brief Durée maximale, en millisecondes. */
  timeMs: number
  /** @brief Mémoire maximale du processus et de ses descendants, en octets. */
  memoryBytes: number
  /** @brief Annulation de l'envoi par le client. */
  signal?: AbortSignal
  /** @brief Chemin de l'aperçu, dont la taille est surveillée. */
  previewPath?: string
}

/** @brief Chemin du programme de décodage une fois compilé, situé à côté de ce fichier. */
const workerPath = fileURLToPath(new URL('./decode-file.js', import.meta.url))
/** @brief Temps entre deux contrôles de la mémoire, en millisecondes. */
const monitorIntervalMs = 20
/** @brief Taille maximale acceptée pour le résultat affiché par le programme de décodage. */
const maxOutputLength = 8192
/**
 * @brief Crée le refus `422 processing_limit` : le fichier demande trop de temps ou de mémoire pour
 *   être vérifié.
 */
const processingLimit = () => fileError(422, 'processing_limit')
/**
 * @brief Crée le refus `503 decoder_unavailable` : le programme de décodage n'a pas pu fonctionner.
 */
const decoderUnavailable = () => fileError(503, 'decoder_unavailable')

/**
 * @brief Dit si l'aperçu MP3 en cours d'écriture est déjà trop gros.
 * @param previewPath Chemin de l'aperçu.
 * @returns Vrai s'il existe et dépasse la taille autorisée.
 */
async function previewExceedsLimit(previewPath?: string): Promise<boolean> {
  if (!previewPath) {
    return false
  }
  const preview = await lstat(previewPath).catch((error) => {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  })
  return preview !== null && preview.size > audioByteLimit
}

/**
 * @brief Lit le résultat affiché par le programme de décodage.
 * @param output Texte affiché par le programme.
 * @returns Les informations établies sur le fichier.
 * @throws {DomainError} Le refus que le programme a prononcé, s'il y en a un.
 * @throws {Error} Si le résultat est illisible ou incomplet.
 */
function parseResult(output: string): ValidatedFile {
  const result = JSON.parse(output)
  if (result.error) {
    throw fileError(result.status, result.error)
  }
  const isComplete =
    Number.isSafeInteger(result.byteSize) && /^[a-f0-9]{64}$/.test(result.checksumSha256)
  if (!isComplete) {
    throw new Error('Invalid result')
  }
  return result
}

/**
 * @brief Lance le décodage d'un fichier dans un programme isolé et le surveille jusqu'à la fin.
 * @details Le programme isolé démarre avec une mémoire limitée et sans aucune variable
 *   d'environnement du serveur : il ne connaît donc ni le mot de passe de la base ni les secrets.
 * @param path Chemin du fichier à vérifier.
 * @param declaredMime Type annoncé par le navigateur.
 * @param budget Limites de durée et de mémoire, et signal d'annulation.
 * @returns Les informations établies sur le fichier.
 * @throws {DomainError} Le refus prononcé par le décodeur ; `422 processing_limit` si une limite
 *   est dépassée ; `400 upload_aborted` si l'envoi est annulé ; `503 decoder_unavailable` si le
 *   programme n'a pas pu fonctionner.
 */
export function superviseDecoding(
  path: string,
  declaredMime: string,
  budget: DecodeBudget
): Promise<ValidatedFile> {
  return new Promise<ValidatedFile>((resolve, reject) => {
    const worker = spawn(
      process.execPath,
      ['--max-old-space-size=64', workerPath, path, declaredMime, budget.previewPath ?? ''],
      {
        detached: true,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { PATH: process.env.PATH, NODE_ENV: 'production' },
      }
    )
    let output = ''
    let failure: DomainError | undefined
    let finished = false
    let inspecting = false

    /**
     * @brief Note la raison de l'arrêt, puis arrête de force le programme de décodage et tous ceux
     *   qu'il a lancés.
     */
    const stop = (error: DomainError) => {
      failure ??= error
      if (worker.pid) {
        try {
          process.kill(-worker.pid, 'SIGKILL')
        } catch {
          // Le groupe de processus est déjà terminé.
        }
      }
    }
    /** @brief Arrête le décodage parce que l'utilisateur a annulé son envoi. */
    const abort = () => stop(fileError(400, 'upload_aborted'))
    const timer = setTimeout(() => stop(processingLimit()), budget.timeMs)
    const monitor = setInterval(async () => {
      if (finished || inspecting || !worker.pid) {
        return
      }
      inspecting = true
      try {
        const overMemory = (await residentBytes(worker.pid)) > budget.memoryBytes
        if (overMemory && !finished) {
          stop(processingLimit())
        }
        if ((await previewExceedsLimit(budget.previewPath)) && !finished) {
          stop(fileError(422, 'preview_too_large'))
        }
      } catch {
        if (!finished) {
          stop(decoderUnavailable())
        }
      } finally {
        inspecting = false
      }
    }, monitorIntervalMs)

    budget.signal?.addEventListener('abort', abort, { once: true })
    if (budget.signal?.aborted) {
      abort()
    }
    worker.stdout.on('data', (chunk) => {
      output += String(chunk)
      if (output.length > maxOutputLength) {
        stop(fileError(415, 'invalid_file'))
      }
    })
    worker.on('error', () => {
      failure = decoderUnavailable()
    })
    worker.on('close', () => {
      finished = true
      clearTimeout(timer)
      clearInterval(monitor)
      budget.signal?.removeEventListener('abort', abort)
      if (failure) {
        return reject(failure)
      }
      try {
        resolve(parseResult(output))
      } catch (error) {
        reject(error instanceof DomainError ? error : fileError(415, 'invalid_file'))
      }
    })
  })
}
