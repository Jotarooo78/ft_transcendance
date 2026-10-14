/**
 * @file validate-file.ts
 * @brief Vérification d'un fichier envoyé : point d'entrée utilisé par le reste du service.
 *
 * @details Principe : un fichier n'est accepté que s'il se décode réellement. Son nom, son
 *   extension et le type annoncé par le navigateur sont choisis par l'expéditeur et ne prouvent
 *   rien.
 *
 * Ce fichier fait un premier contrôle rapide (taille, premiers octets), choisit les limites de
 * temps et de mémoire selon qu'il s'agit d'une image ou d'un audio, puis confie le décodage complet
 * au programme isolé (voir decode-supervisor.ts).
 */

import { DomainError } from '@ft/service-kit'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { fileError } from '../domain/errors.js'
import type { ValidatedFile } from '../domain/file.js'
import {
  audioByteLimit,
  detectImageFormat,
  imageByteLimit,
  signatureLength,
} from '../domain/limits.js'
import { superviseDecoding } from './decode-supervisor.js'

/**
 * @brief Limites qu'un appelant peut réduire pour une vérification donnée. Les tests s'en servent
 *   pour provoquer un dépassement.
 */
export type ValidationLimits = {
  /** @brief Budget de temps, plafonné par celui du type de fichier. */
  timeMs?: number
  /** @brief Budget de mémoire, plafonné par celui du type de fichier. */
  memoryBytes?: number
  /** @brief Annule le décodage quand l'envoi est interrompu. */
  signal?: AbortSignal
  /** @brief Où écrire l'aperçu MP3 d'un audio. */
  previewPath?: string
}

/**
 * @brief Type de la fonction de vérification : elle reçoit le chemin d'un fichier et le type
 *   annoncé, et renvoie les informations établies.
 */
export type FileValidator = (
  path: string,
  declaredMime: string,
  limits?: ValidationLimits
) => Promise<ValidatedFile>

/** @brief Limites pour une image : 30 secondes et 256 Mio de mémoire. */
const imageBudget = { timeMs: 30_000, memoryBytes: 268_435_456 }
/** @brief Limites pour un fichier audio : 5 minutes et 512 Mio de mémoire. */
const audioBudget = { timeMs: 300_000, memoryBytes: 536_870_912 }

/**
 * @brief Contrôle la taille du fichier avant tout décodage et regarde s'il s'agit d'une image.
 * @param path Chemin du fichier.
 * @returns Vrai si ses premiers octets sont ceux d'une image ; faux s'il doit être traité comme un
 *   audio.
 * @throws {DomainError} `415 invalid_file` si ce n'est pas un fichier ordinaire, `400 empty_file`
 *   s'il est vide, `413 file_too_large` s'il est trop gros.
 */
async function isImageWithinLimits(path: string): Promise<boolean> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await file.stat()
    if (!stat.isFile()) {
      throw fileError(415, 'invalid_file')
    }
    if (!stat.size) {
      throw fileError(400, 'empty_file')
    }
    if (stat.size > audioByteLimit) {
      throw fileError(413, 'file_too_large')
    }
    const header = Buffer.alloc(signatureLength)
    await file.read(header, 0, signatureLength, 0)
    const isImage = detectImageFormat(header) !== null
    if (isImage && stat.size > imageByteLimit) {
      throw fileError(413, 'file_too_large')
    }
    return isImage
  } finally {
    await file.close()
  }
}

/**
 * @brief Crée la fonction de vérification du service.
 * @details Elle ne traite qu'un fichier à la fois, pour que la mémoire utilisée reste prévisible.
 *   Si elle est appelée pendant qu'un décodage est en cours, elle refuse avec `503 decoder_busy`.
 * @returns La fonction de vérification.
 */
export function createFileValidator(): FileValidator {
  let busy = false

  return async (path, declaredMime, limits = {}) => {
    if (busy) {
      throw fileError(503, 'decoder_busy')
    }
    if (process.platform !== 'linux') {
      throw fileError(503, 'decoder_unavailable')
    }
    busy = true
    try {
      const budget = (await isImageWithinLimits(path)) ? imageBudget : audioBudget
      return await superviseDecoding(path, declaredMime, {
        timeMs: Math.min(limits.timeMs ?? Infinity, budget.timeMs),
        memoryBytes: Math.min(limits.memoryBytes ?? Infinity, budget.memoryBytes),
        signal: limits.signal,
        previewPath: limits.previewPath,
      })
    } catch (error) {
      if (error instanceof DomainError) {
        throw error
      }
      throw fileError(503, 'storage_unavailable')
    } finally {
      busy = false
    }
  }
}
