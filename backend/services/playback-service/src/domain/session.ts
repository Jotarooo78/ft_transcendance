/**
 * @file session.ts
 * @brief Définition d'une session d'écoute et conversion entre sa forme en base et sa forme envoyée
 *   au client.
 *
 * @details Une session d'écoute est l'enregistrement d'une écoute : tel compte a lancé tel morceau
 *   à telle heure. Elle est ouverte quand le lecteur démarre un morceau, mise à jour pendant la
 *   lecture, puis fermée.
 *
 * Elle porte deux mesures qu'il ne faut pas confondre. La position (`positionMs`) dit où en est le
 * lecteur dans le morceau. Le temps écouté (`listenedMs`) dit combien de temps de musique a
 * réellement été joué. Si l'utilisateur saute directement à la fin du morceau, la position vaut
 * presque la durée du morceau, mais le temps écouté reste proche de zéro.
 *
 * Le dossier `domain/` décrit le métier sans rien de technique : ni HTTP, ni base de données.
 */

/**
 * @brief Une session d'écoute telle que le client la reçoit dans une réponse HTTP.
 * @details Toutes les durées sont en millisecondes. `endedAt` vaut null tant que la session est
 *   ouverte. `lastSequence` est le numéro du dernier événement de progression accepté, 0 s'il n'y
 *   en a encore aucun.
 */
export type Session = {
  /** @brief UUID de la session. */
  id: string
  /** @brief UUID du morceau écouté. */
  trackId: string
  /** @brief Durée du morceau, figée à l'ouverture de la session. */
  trackDurationMs: number
  /** @brief Date d'ouverture, au format ISO. */
  startedAt: string
  /** @brief null tant que la session est ouverte. */
  endedAt: string | null
  /** @brief Temps crédité par le serveur, jamais supérieur à la durée du morceau. */
  listenedMs: number
  /** @brief Dernière séquence confirmée ; 0 avant le premier événement. */
  lastSequence: number
  /** @brief Position dans le morceau ; un déplacement n'est pas du temps écouté. */
  positionMs: number
}

/**
 * @brief Une session telle qu'elle est lue en base, avant conversion.
 * @details Les durées y sont des `bigint`, un type d'entier que JSON ne sait pas écrire, et les
 *   dates des objets `Date`. `trackDurationMs` est la durée du morceau, copiée depuis le catalogue
 *   à l'ouverture : elle ne change plus ensuite, même si le catalogue est modifié.
 */
export type SessionRow = {
  /** @brief UUID de la session. */
  id: string
  /** @brief UUID du morceau écouté. */
  trackId: string
  /** @brief Durée du morceau, figée à l'ouverture. */
  trackDurationMs: bigint
  /** @brief Date d'ouverture. */
  startedAt: Date
  /** @brief Date de clôture, ou null tant que la session est ouverte. */
  endedAt: Date | null
  /** @brief Temps crédité par le serveur, en millisecondes. */
  listenedMs: bigint
  /** @brief Dernière séquence confirmée ; 0 avant le premier événement. */
  lastSequence: number
}

/**
 * @brief Une session lue pour l'historique, accompagnée de son dernier événement de progression.
 * @details Le dernier événement sert à connaître la position où l'écoute s'est arrêtée.
 */
export type HistoryRow = SessionRow & { events: { sequence: number; positionMs: bigint }[] }

/**
 * @brief Convertit un entier lu en base (`bigint`) en nombre JavaScript ordinaire.
 * @details Un nombre JavaScript ne représente exactement les entiers que jusqu'à environ 9 millions
 *   de milliards. Au-delà, ou pour une valeur négative, la donnée est considérée comme incohérente.
 * @param value Entier lu en base.
 * @returns Le même entier, sous forme de nombre.
 * @throws {Error} Si la valeur est négative ou trop grande pour être exacte.
 */
export function toSafeNumber(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Unsupported stored integer')
  }
  return Number(value)
}

/**
 * @brief Transforme une session lue en base en session prête à être envoyée au client.
 * @details Avant de convertir, elle vérifie que la ligne est cohérente : le temps écouté et la
 *   position ne dépassent pas la durée du morceau, et le numéro de séquence est valide. Une ligne
 *   incohérente provoque une erreur plutôt qu'une réponse fausse.
 * @param row Session lue en base.
 * @param positionMs Position du dernier événement accepté ; 0 s'il n'y en a aucun.
 * @returns La session sous sa forme publique.
 * @throws {Error} Si la ligne est incohérente. Le client reçoit alors `503 playback_unavailable`.
 */
export function toSession(row: SessionRow, positionMs = 0n): Session {
  const duration = toSafeNumber(row.trackDurationMs)
  const listened = toSafeNumber(row.listenedMs)
  const position = toSafeNumber(positionMs)
  const hasValidSequence = Number.isInteger(row.lastSequence) && row.lastSequence >= 0
  if (duration <= 0 || listened > duration || position > duration || !hasValidSequence) {
    throw new Error('Invalid stored session')
  }
  return {
    id: row.id,
    trackId: row.trackId,
    trackDurationMs: duration,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    listenedMs: listened,
    lastSequence: row.lastSequence,
    positionMs: position,
  }
}

/**
 * @brief Transforme une session de l'historique en session prête à être envoyée au client.
 * @param row Session et son dernier événement, lus en base.
 * @returns La session publique, à la position de son dernier événement.
 * @throws {Error} Si la session annonce un événement qui n'existe pas en base.
 */
export function toHistorySession(row: HistoryRow): Session {
  const latest = row.events.find((event) => event.sequence === row.lastSequence)
  if (row.lastSequence > 0 && !latest) {
    throw new Error('Missing latest event')
  }
  return toSession(row, latest?.positionMs ?? 0n)
}
