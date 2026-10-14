/**
 * @file progress.ts
 * @brief Règles qui décident comment une session d'écoute avance et se ferme. C'est le cœur de
 *   playback-service.
 *
 * @details Fonctionnement vu du client : pendant la lecture, le lecteur audio envoie régulièrement
 *   un « événement de progression ». Chaque événement porte un numéro (1, puis 2, puis 3...), la
 *   position dans le morceau et le temps total que le lecteur dit avoir joué.
 *
 * Première règle : le serveur ne croit pas le lecteur sur parole. Un client modifié pourrait
 * prétendre avoir écouté une heure en dix secondes. Le temps crédité est donc limité par ce qui est
 * physiquement possible : le temps réellement écoulé sur l'horloge du serveur et la durée du
 * morceau.
 *
 * Deuxième règle : un événement n'est jamais compté deux fois. Si la réponse du serveur se perd sur
 * le réseau, le lecteur renvoie le même événement. Le serveur reconnaît son numéro et répond la
 * même chose sans rien réécrire. C'est ce qu'on appelle une opération « idempotente ».
 *
 * Ces fonctions ne connaissent pas la base de données : elles reçoivent un objet
 * `SessionTransaction` qui leur fournit les lectures et écritures nécessaires. Le repository en
 * donne la version réelle, les tests une version en mémoire.
 */

import { invalidRequest } from '@ft/service-kit'
import { progressConflict } from './errors.js'
import { toSafeNumber, toSession, type Session, type SessionRow } from './session.js'

/**
 * @brief Événement de progression envoyé par le lecteur.
 * @details `sequence` : numéro de l'événement, qui augmente de 1 à chaque envoi en partant de 1.
 *   `positionMs` : position dans le morceau. `listenedMsTotal` : temps total que le lecteur déclare
 *   avoir joué depuis l'ouverture de la session. Les deux durées sont en millisecondes.
 */
export type Progress = { sequence: number; positionMs: number; listenedMsTotal: number }

/**
 * @brief Événement de progression tel qu'il est enregistré en base.
 * @details Il contient ce que le lecteur a envoyé, plus `receivedAt` : l'heure à laquelle le
 *   serveur l'a reçu, lue sur l'horloge du serveur et non sur celle du client.
 */
export type EventRow = {
  /** @brief Numéro de l'événement, croissant à partir de 1. */
  sequence: number
  /** @brief Position dans le morceau, en millisecondes. */
  positionMs: bigint
  /** @brief Temps total déclaré par le lecteur, en millisecondes. */
  listenedMsTotal: bigint
  /** @brief Date de réception, prise sur l'horloge du serveur. */
  receivedAt: Date
}

/**
 * @brief Lectures et écritures disponibles pendant qu'une session est réservée.
 * @details « Réservée » signifie qu'aucune autre requête ne peut modifier cette session en même
 *   temps (voir `withLock` dans repositories/sessions.repository.ts). Le domaine ne connaît pas
 *   Prisma : il reçoit ces opérations du repository. Un test les remplace par une version en
 *   mémoire.
 */
export type SessionTransaction = {
  /** @brief État de la session au moment du verrou. */
  session: SessionRow
  /** @brief Lit l'événement d'une séquence, ou null. */
  getEvent: (sequence: number) => Promise<EventRow | null>
  /** @brief Enregistre un nouvel événement. */
  createEvent: (event: EventRow) => Promise<void>
  /** @brief Enregistre le temps crédité et la dernière séquence. */
  saveProgress: (listenedMs: bigint, sequence: number) => Promise<SessionRow>
  /** @brief Enregistre la date de clôture. */
  saveClose: (endedAt: Date) => Promise<SessionRow>
}

/**
 * @brief Fonction qui renvoie l'heure courante en millisecondes.
 * @details En production c'est `Date.now`. Les tests passent une fausse horloge pour simuler le
 *   temps qui passe sans attendre réellement.
 */
type Clock = () => number

/**
 * @brief Ramène une valeur négative à zéro.
 * @param value Valeur à borner.
 * @returns La valeur, ou 0 si elle est négative.
 */
const nonNegative = (value: bigint) => (value < 0n ? 0n : value)
/**
 * @brief Renvoie la plus petite valeur d'une liste.
 * @param values Valeurs à comparer.
 * @returns La plus petite.
 */
const smallest = (values: bigint[]) => values.reduce((a, b) => (a < b ? a : b))

/**
 * @brief Lit l'heure sur l'horloge du serveur.
 * @param clock Horloge à lire.
 * @returns L'heure en millisecondes, sans décimales.
 * @throws {Error} Si l'horloge renvoie une valeur inutilisable.
 */
function readClock(clock: Clock): number {
  const now = Math.trunc(clock())
  if (!Number.isSafeInteger(now)) {
    throw new Error('Invalid server clock')
  }
  return now
}

/**
 * @brief Lit le dernier événement accepté de la session.
 * @param tx Session réservée.
 * @returns L'événement, ou null si la session n'en a encore reçu aucun.
 * @throws {Error} Si la session annonce un événement qui n'existe pas en base : donnée incohérente.
 */
async function latestEvent(tx: SessionTransaction): Promise<EventRow | null> {
  const { lastSequence } = tx.session
  if (lastSequence === 0) {
    return null
  }
  const event = await tx.getEvent(lastSequence)
  if (!event) {
    throw new Error('Missing latest event')
  }
  return event
}

/**
 * @brief Répond à un événement dont le numéro a déjà été reçu.
 * @details Si le contenu est identique à celui déjà enregistré, c'est un simple renvoi : on répond
 *   l'état actuel de la session, sans aucune écriture. Si le contenu diffère, le client tente de
 *   réécrire le passé et la demande est refusée.
 * @param tx Session réservée.
 * @param existing Événement déjà enregistré sous ce numéro.
 * @param input Événement reçu.
 * @returns L'état actuel de la session.
 * @throws {DomainError} `409 progress_conflict` si le contenu reçu diffère du contenu enregistré.
 */
async function confirmExisting(tx: SessionTransaction, existing: EventRow, input: Progress) {
  const isSameEvent =
    existing.positionMs === BigInt(input.positionMs) &&
    existing.listenedMsTotal === BigInt(input.listenedMsTotal)
  if (!isSameEvent) {
    throw progressConflict()
  }
  const latest = await latestEvent(tx)
  return toSession(tx.session, latest?.positionMs ?? 0n)
}

/**
 * @brief Calcule combien de temps d'écoute ajouter à la session pour un nouvel événement.
 * @details C'est le plus petit de quatre montants. 1) Ce que le lecteur déclare avoir joué depuis
 *   l'événement précédent. 2) Le temps réellement écoulé sur l'horloge du serveur depuis cet
 *   événement précédent. 3) Le temps écoulé depuis l'ouverture de la session, moins ce qui a déjà
 *   été crédité. 4) Ce qui reste du morceau. Exemple : le lecteur déclare 60 secondes de plus, mais
 *   le serveur n'a vu passer que 10 secondes depuis l'événement précédent ; seules 10 secondes sont
 *   créditées.
 * @param session Session réservée.
 * @param previous Événement précédent, ou null si c'est le premier.
 * @param declared Temps total déclaré par le lecteur.
 * @param now Heure du serveur en millisecondes.
 * @returns Le temps à ajouter, en millisecondes ; jamais négatif.
 */
function creditedTime(
  session: SessionRow,
  previous: EventRow | null,
  declared: bigint,
  now: number
) {
  const declaredSincePrevious = declared - (previous?.listenedMsTotal ?? 0n)
  const elapsedSincePrevious = BigInt(now - (previous?.receivedAt ?? session.startedAt).getTime())
  const elapsedNotYetCredited = BigInt(now - session.startedAt.getTime()) - session.listenedMs
  const remainingInTrack = session.trackDurationMs - session.listenedMs
  return smallest([
    declaredSincePrevious,
    nonNegative(elapsedSincePrevious),
    nonNegative(elapsedNotYetCredited),
    nonNegative(remainingInTrack),
  ])
}

/**
 * @brief Traite un événement de progression reçu du lecteur.
 * @details Déroulement : 1) si ce numéro a déjà été reçu, répondre comme la première fois
 *   (`confirmExisting`) ; 2) sinon, vérifier que la session est ouverte et que le numéro est bien
 *   le suivant ; 3) vérifier que la position ne dépasse pas la durée du morceau et que le temps
 *   déclaré ne recule pas ; 4) calculer le temps à créditer ; 5) enregistrer l'événement et mettre
 *   à jour la session. La fonction qui appelle celle-ci a déjà réservé la session.
 * @param tx Session réservée et ses opérations.
 * @param input Événement reçu.
 * @param clock Horloge du serveur ; les tests la remplacent.
 * @returns La session à jour.
 * @throws {DomainError} `409 progress_conflict` si la session est fermée, si le numéro n'est pas le
 *   suivant, si le temps déclaré recule ou si un renvoi diffère de l'original ; `400
 *   invalid_request` si la position dépasse la durée du morceau.
 */
export async function recordProgress(
  tx: SessionTransaction,
  input: Progress,
  clock: Clock = Date.now
): Promise<Session> {
  const session = tx.session
  const existing = await tx.getEvent(input.sequence)
  if (existing) {
    return confirmExisting(tx, existing, input)
  }
  if (session.endedAt || input.sequence !== session.lastSequence + 1) {
    throw progressConflict()
  }
  if (input.positionMs > toSafeNumber(session.trackDurationMs)) {
    throw invalidRequest()
  }

  const previous = await latestEvent(tx)
  const declared = BigInt(input.listenedMsTotal)
  if (declared < (previous?.listenedMsTotal ?? 0n)) {
    throw progressConflict()
  }

  const now = readClock(clock)
  const positionMs = BigInt(input.positionMs)
  const credited = creditedTime(session, previous, declared, now)
  await tx.createEvent({
    sequence: input.sequence,
    positionMs,
    listenedMsTotal: declared,
    receivedAt: new Date(now),
  })
  const updated = await tx.saveProgress(session.listenedMs + credited, input.sequence)
  return toSession(updated, positionMs)
}

/**
 * @brief Ferme une session d'écoute.
 * @details La fermeture n'ajoute aucun temps d'écoute : seul un événement de progression peut en
 *   créditer. Fermer une session déjà fermée n'est pas une erreur : on renvoie simplement son état,
 *   sans rien écrire.
 * @param tx Session réservée et ses opérations.
 * @param clock Horloge du serveur ; les tests la remplacent.
 * @returns La session fermée.
 */
export async function recordClose(
  tx: SessionTransaction,
  clock: Clock = Date.now
): Promise<Session> {
  const session = tx.session
  const positionMs = (await latestEvent(tx))?.positionMs ?? 0n
  if (session.endedAt) {
    return toSession(session, positionMs)
  }
  const endedAt = new Date(Math.max(session.startedAt.getTime(), readClock(clock)))
  return toSession(await tx.saveClose(endedAt), positionMs)
}
