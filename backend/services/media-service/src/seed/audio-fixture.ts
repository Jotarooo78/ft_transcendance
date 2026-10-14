/**
 * @file audio-fixture.ts
 * @brief Fabrication des trois fichiers audio de démonstration.
 *
 * @details Pour que l'application ait quelque chose à faire écouter dès l'installation, sans
 *   embarquer de vraie musique dans le dépôt, ce fichier fabrique par calcul trois petits fichiers
 *   WAV contenant chacun une note continue.
 */

import { createHash } from 'node:crypto'

/** @brief Nombre de mesures du son par seconde. */
const sampleRate = 8000
/** @brief Durée de chaque fichier, en secondes. */
const seconds = 6
/** @brief Taille de l'en-tête d'un fichier WAV, en octets. */
const headerLength = 44
/** @brief Hauteur de la note de chacun des trois fichiers, en hertz. */
const frequencies = [220, 330, 440]

/**
 * @brief Fabrique un fichier WAV de démonstration.
 * @param index Numéro du fichier : 1, 2 ou 3.
 * @returns Le contenu du fichier. Il est exactement le même à chaque appel.
 * @throws {Error} Si le numéro n'est pas 1, 2 ou 3.
 */
export function demoAudio(index: number): Buffer {
  const frequency = frequencies[index - 1]
  if (frequency === undefined) {
    throw new Error('Unknown demo')
  }
  const samples = sampleRate * seconds
  const bytes = Buffer.alloc(headerLength + samples * 2)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(sampleRate * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples * 2, 40)
  for (let sample = 0; sample < samples; sample++) {
    const amplitude = Math.round(2000 * Math.sin((2 * Math.PI * frequency * sample) / sampleRate))
    bytes.writeInt16LE(amplitude, headerLength + sample * 2)
  }
  return bytes
}

/**
 * @brief Calcule l'empreinte SHA-256 d'un contenu : une suite de caractères qui change dès qu'un
 *   seul octet change.
 * @param bytes Contenu.
 * @returns L'empreinte, écrite en hexadécimal.
 */
export const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
