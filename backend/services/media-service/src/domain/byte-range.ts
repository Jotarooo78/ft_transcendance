/**
 * @file byte-range.ts
 * @brief Lecture de l'en-tête HTTP `Range`, par lequel un lecteur audio demande une partie
 *   seulement d'un fichier.
 *
 * @details Un lecteur audio ne télécharge pas forcément tout le morceau d'un coup. Quand
 *   l'utilisateur saute au milieu, le navigateur envoie par exemple `Range: bytes=1000000-` (« à
 *   partir du millionième octet »). Le serveur répond alors avec le statut 206 et seulement la
 *   partie demandée.
 */

/**
 * @brief Partie d'un fichier à envoyer : le numéro du premier octet et celui du dernier, tous deux
 *   inclus.
 */
export type ByteRange = { start: number; end: number }

/**
 * @brief Interprète la valeur d'un en-tête `Range`.
 * @details Trois écritures sont comprises. `bytes=0-43` : du premier au 44e octet. `bytes=96040-` :
 *   de l'octet 96040 jusqu'à la fin. `bytes=-4` : les quatre derniers octets. Si la fin demandée
 *   dépasse le fichier, elle est ramenée à la fin du fichier. Les demandes de plusieurs parties à
 *   la fois ne sont pas prises en charge.
 * @param header Valeur de l'en-tête.
 * @param size Taille du fichier, en octets.
 * @returns La partie à envoyer, ou null si la demande est mal formée ou située hors du fichier (le
 *   contrôleur répond alors 416).
 */
export function parseByteRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) {
    return null
  }
  const first = Number(match[1])
  const last = Number(match[2])
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) {
    return null
  }
  if (!match[1]) {
    return last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : null
  }
  const end = match[2] ? Math.min(last, size - 1) : size - 1
  return first < size && first <= end ? { start: first, end } : null
}
