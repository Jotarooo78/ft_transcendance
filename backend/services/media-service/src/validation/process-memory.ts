/**
 * @file process-memory.ts
 * @brief Mesure de la mémoire utilisée par un programme et par tous ceux qu'il a lancés.
 *
 * @details Le programme de décodage lance lui-même ffmpeg. Pour limiter la mémoire totale, il faut
 *   donc additionner celle du programme et celle de ses « descendants ».
 */

import { readFile } from 'node:fs/promises'

/** @brief Codes d'erreur indiquant que le programme observé s'est terminé entre-temps. */
const goneCodes = ['ENOENT', 'ESRCH']

/**
 * @brief Calcule la mémoire utilisée par un programme et tous ses descendants.
 * @details Les valeurs sont lues dans le dossier `/proc`, que Linux tient à jour pour chaque
 *   programme en cours. Cette fonction ne marche donc que sous Linux, ce qui est le cas dans
 *   Docker.
 * @param pid Numéro du programme, attribué par le système.
 * @returns La mémoire utilisée, en octets ; 0 si le programme est terminé.
 */
export async function residentBytes(pid: number): Promise<number> {
  try {
    const status = await readFile(`/proc/${pid}/status`, 'utf8')
    const children = await readFile(`/proc/${pid}/task/${pid}/children`, 'utf8')
    const own = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) * 1024
    const childPids = children.trim().split(/\s+/).filter(Boolean).map(Number)
    const descendants = await Promise.all(childPids.map(residentBytes))
    return descendants.reduce((sum, bytes) => sum + bytes, own)
  } catch (error) {
    if (goneCodes.includes((error as NodeJS.ErrnoException).code ?? '')) {
      return 0
    }
    throw error
  }
}
