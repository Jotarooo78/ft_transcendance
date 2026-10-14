/**
 * @file track.ts
 * @brief Définition d'un morceau du catalogue et conversion entre sa forme en base et sa forme
 *   envoyée au client.
 *
 * @details Le dossier `domain/` contient ce qui décrit le métier indépendamment de toute technique
 *   : ni HTTP, ni base de données. On y trouve les types (à quoi ressemble un morceau), les
 *   fonctions pures (qui transforment une valeur en une autre sans rien lire ni écrire ailleurs) et
 *   les erreurs métier.
 *
 * Un morceau existe ici sous deux formes. `TrackRow` est ce que la requête SQL renvoie. `Track` est
 * ce que le client reçoit. Elles diffèrent volontairement : la durée est un très grand entier
 * (`bigint`) en base et un nombre ordinaire dans la réponse, et la réponse ajoute des champs
 * calculés comme l'adresse de lecture de l'audio.
 */

import { DomainError } from '@ft/service-kit'

/**
 * @brief Un morceau tel que la requête SQL le renvoie, avant toute conversion.
 * @details Ce n'est pas une copie exacte de la table `tracks` : la requête (voir
 *   repositories/track-list.sql.ts) y ajoute déjà le nom des artistes, le titre de l'album et le
 *   genre, calculés à partir d'autres tables.
 */
export type TrackRow = {
  /** @brief UUID du morceau. */
  id: string
  /** @brief Titre du morceau. */
  title: string
  /** @brief Noms des artistes crédités, séparés par des virgules. */
  artistName: string
  /** @brief Titre de la première sortie publiée, ou chaîne vide. */
  albumTitle: string
  /** @brief Premier genre du morceau, ou chaîne vide. */
  genre: string
  /** @brief Durée en millisecondes, ou null si elle est inconnue. */
  durationMs: bigint | null
  /** @brief UUID du fichier audio dans Media, ou null. */
  audioAssetId: string | null
}

/**
 * @brief Un morceau tel que le client le reçoit dans une réponse HTTP.
 * @details Seuls les morceaux publiés sont renvoyés. Cette forme ne contient que des informations
 *   publiques ; elle est aussi décrite, pour la validation des réponses, dans
 *   schemas/tracks.schema.ts.
 */
export type Track = {
  /** @brief UUID du morceau. */
  id: string
  /** @brief Titre du morceau. */
  title: string
  /** @brief Noms des artistes crédités, séparés par des virgules. */
  artistName: string
  /** @brief Titre de la première sortie publiée, ou chaîne vide. */
  albumTitle: string
  /** @brief Premier genre du morceau, ou chaîne vide. */
  genre: string
  /** @brief Durée en millisecondes, ou null. */
  durationMs: number | null
  /** @brief Durée en secondes, pour l'affichage. */
  durationSeconds: number | null
  /** @brief UUID du fichier audio dans Media, ou null. */
  audioAssetId: string | null
  /** @brief Chemin de lecture de l'audio, servi par Media ; null sans audio. */
  audioUrl: string | null
}

/**
 * @brief Crée l'erreur « ce morceau n'existe pas ».
 * @details Elle est levée quand l'identifiant demandé ne correspond à aucun morceau publié. Un
 *   morceau encore en brouillon donne exactement la même erreur qu'un identifiant inconnu : ainsi,
 *   personne ne peut deviner l'existence d'un brouillon. Le serveur la transforme en réponse `404 {
 *   "error": "track_not_found" }`.
 * @returns L'erreur à lever avec `throw`.
 */
export const trackNotFound = () => new DomainError(404, 'track_not_found')

/**
 * @brief Convertit la durée lue en base en nombre utilisable dans une réponse JSON.
 * @details En base, la durée est un `bigint`, un type d'entier sans limite de taille que JSON ne
 *   sait pas écrire. On le convertit en nombre ordinaire, en vérifiant qu'il n'y a aucune perte de
 *   précision : au-delà d'environ 9 millions de milliards, un nombre JavaScript n'est plus exact.
 * @param value Durée en millisecondes, ou null si le morceau n'a pas encore de durée connue.
 * @returns La durée en millisecondes, ou null.
 * @throws {Error} Si la durée est nulle, négative ou trop grande pour être exacte. Cela signale une
 *   donnée incohérente en base, pas une erreur de l'utilisateur.
 */
function toDurationMs(value: bigint | null): number | null {
  if (value === null) {
    return null
  }
  const duration = Number(value)
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    throw new Error('Unrepresentable track duration')
  }
  return duration
}

/**
 * @brief Transforme un morceau lu en base en morceau prêt à être envoyé au client.
 * @details Trois choses changent : la durée devient un nombre ordinaire ; on ajoute
 *   `durationSeconds`, la même durée en secondes, pratique pour l'affichage ; on ajoute `audioUrl`,
 *   l'adresse à laquelle le navigateur peut écouter le morceau. Cette adresse pointe vers
 *   media-service, car c'est lui qui stocke les fichiers audio. Un morceau sans fichier audio a une
 *   adresse nulle.
 * @param row Morceau lu en base.
 * @returns Le morceau sous sa forme publique.
 * @throws {Error} Si la durée stockée n'est pas utilisable (voir toDurationMs).
 */
export function toTrack(row: TrackRow): Track {
  const durationMs = toDurationMs(row.durationMs)
  return {
    id: row.id,
    title: row.title,
    artistName: row.artistName,
    albumTitle: row.albumTitle,
    genre: row.genre,
    durationMs,
    durationSeconds: durationMs === null ? null : durationMs / 1000,
    audioAssetId: row.audioAssetId,
    audioUrl: row.audioAssetId ? `/api/media/assets/${row.audioAssetId}/audio` : null,
  }
}
