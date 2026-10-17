/**
 * @file playlist.ts
 * @brief Définition d'une playlist, règles de saisie de son nom et de sa description, et conversion
 *   entre sa forme en base et sa forme envoyée au client.
 *
 * @details Le dossier `domain/` décrit le métier sans rien de technique : ni HTTP, ni base de
 *   données. Ses fonctions sont « pures » : elles transforment une valeur en une autre sans rien
 *   lire ni écrire ailleurs, ce qui les rend très faciles à tester.
 *
 * Deux idées à connaître pour ce service. Une playlist appartient à un seul compte ; son propriétaire peut
 * choisir de la rendre publique. Et elle porte un numéro de version qui augmente de 1 à chaque modification : quand
 * un client veut la modifier, il envoie la version qu'il a lue ; si entre-temps elle a changé (par
 * exemple depuis un autre onglet), la modification est refusée au lieu d'écraser le changement
 * précédent.
 */

import { invalidRequest } from '@ft/service-kit'

/**
 * @brief Un morceau placé dans une playlist, qu'on appelle une « occurrence ».
 * @details `id` identifie cette ligne de la playlist, pas le morceau : si le même morceau est
 *   ajouté deux fois, il y a deux occurrences avec deux `id` différents, et on peut en retirer une
 *   sans toucher à l'autre. `trackId` est l'identifiant du morceau dans le catalogue. `position`
 *   est son rang dans la playlist.
 */
export type PlaylistItem = { id: string; trackId: string; position: number; addedAt?: string }

/**
 * @brief Une playlist telle que le client la reçoit dans une réponse HTTP.
 * @details L'identité publique du créateur permet d'afficher son profil ; aucune donnée de connexion
 *   n'est exposée. L'accès privé et la visibilité publique sont contrôlés avant cette conversion.
 */
export type Playlist = {
  /** Identité publique du créateur, disponible sur les lignes persistées. */
  ownerUserId?: string
  /** Date ISO de création de la playlist. */
  createdAt?: string
  /** Date ISO de la dernière modification confirmée. */
  updatedAt?: string
  /** Image validée chez Media ; null laisse la place à la pochette automatique. */
  coverAssetId?: string | null
  /** @brief UUID de la playlist. */
  id: string
  /** @brief Nom de la playlist. */
  name: string
  /** @brief Description ; chaîne vide quand il n'y en a pas. */
  description: string
  /** @brief Visibilité confirmée par le serveur. */
  visibility: 'private' | 'public'
  /** @brief Numéro de version, incrémenté à chaque modification. */
  version: number
  /** @brief Occurrences, dans l'ordre des positions. */
  items: PlaylistItem[]
}

/** @brief Nom et description d'une playlist, une fois nettoyés et vérifiés. */
export type PlaylistInput = { name: string; description: string; visibility?: 'private' | 'public' }
/**
 * @brief Modifications à appliquer à une playlist. Un champ absent signifie « ne pas toucher à ce
 *   champ ».
 */
export type PlaylistChanges = Partial<PlaylistInput>

/**
 * @brief Une playlist telle qu'elle est lue en base, avant conversion.
 * @details Deux différences avec `Playlist` : la description peut valoir null, et la version est un
 *   `bigint`, un type d'entier que JSON ne sait pas écrire.
 */
export type PlaylistRow = {
  /** Métadonnées SQL ; facultatives pour les anciennes doublures de tests. */
  ownerUserId?: string
  createdAt?: Date
  updatedAt?: Date
  coverAssetId?: string | null
  /** @brief UUID de la playlist. */
  id: string
  /** @brief Nom de la playlist. */
  name: string
  /** @brief Description, ou null. */
  description: string | null
  /** @brief Visibilité stockée ; unlisted historique est traité comme privé. */
  visibility?: string
  /** @brief Numéro de version stocké. */
  version: bigint
  /** @brief Occurrences de la playlist. */
  items: (Omit<PlaylistItem, 'addedAt'> & { addedAt?: Date })[]
}

/** @brief Longueur maximale du nom d'une playlist, en caractères. */
const maxNameLength = 100
/** @brief Longueur maximale de la description d'une playlist, en caractères. */
const maxDescriptionLength = 2000

/**
 * @brief Compte le nombre de caractères d'un texte tels qu'une personne les voit.
 * @details En JavaScript, `texte.length` compte certains caractères deux fois, notamment les
 *   emojis. Cette fonction compte un emoji comme un seul caractère : une limite de 100 caractères
 *   veut donc dire la même chose pour l'utilisateur et pour le serveur.
 * @param text Texte à mesurer.
 * @returns Son nombre de caractères.
 */
const lengthOf = (text: string) => [...text].length

/**
 * @brief Nettoie le nom saisi et vérifie sa longueur.
 * @param value Nom tel que saisi.
 * @returns Le nom sans espaces au début ni à la fin.
 * @throws {DomainError} `400 invalid_request` si le nom est vide (ou ne contient que des espaces)
 *   ou dépasse 100 caractères.
 */
function cleanName(value: string): string {
  const name = value.trim()
  if (lengthOf(name) < 1 || lengthOf(name) > maxNameLength) {
    throw invalidRequest()
  }
  return name
}

/**
 * @brief Nettoie la description saisie et vérifie sa longueur.
 * @param value Description telle que saisie.
 * @returns La description sans espaces au début ni à la fin.
 * @throws {DomainError} `400 invalid_request` si elle dépasse 2000 caractères.
 */
function cleanDescription(value: string): string {
  const description = value.trim()
  if (lengthOf(description) > maxDescriptionLength) {
    throw invalidRequest()
  }
  return description
}

/**
 * @brief Prépare les données d'une nouvelle playlist.
 * @details Le schéma de la route a déjà vérifié que `name` est un texte. Ici on applique les règles
 *   que le schéma ne sait pas exprimer : mesurer la longueur après avoir retiré les espaces.
 * @param body Corps de la requête ; la description est facultative.
 * @returns Le nom et la description prêts à être enregistrés. Une description absente devient une
 *   chaîne vide.
 * @throws {DomainError} `400 invalid_request` si le nom ou la description ne respecte pas ses
 *   limites.
 */
export function toPlaylistInput(body: {
  name: string
  description?: string
  visibility?: 'private' | 'public'
}): PlaylistInput {
  return {
    name: cleanName(body.name),
    description: cleanDescription(body.description ?? ''),
    visibility: body.visibility ?? 'private',
  }
}

/**
 * @brief Prépare les modifications d'une playlist existante.
 * @details Le client peut envoyer le nom, la description, ou les deux. Envoyer une requête de
 *   modification qui ne modifie rien est considéré comme une erreur.
 * @param body Corps de la requête.
 * @returns Uniquement les champs envoyés, nettoyés.
 * @throws {DomainError} `400 invalid_request` si aucun champ n'est fourni ou si une limite est
 *   dépassée.
 */
export function toPlaylistChanges(body: {
  name?: string
  description?: string
  visibility?: 'private' | 'public'
}): PlaylistChanges {
  if (body.name === undefined && body.description === undefined && body.visibility === undefined) {
    throw invalidRequest()
  }
  return {
    ...(body.visibility === undefined ? {} : { visibility: body.visibility }),
    ...(body.name === undefined ? {} : { name: cleanName(body.name) }),
    ...(body.description === undefined ? {} : { description: cleanDescription(body.description) }),
  }
}

/**
 * @brief Transforme une playlist lue en base en playlist prête à être envoyée au client.
 * @details La version devient un nombre ordinaire, la description null devient une chaîne vide, et
 *   chaque occurrence est réduite à ses trois champs publics.
 * @param row Playlist lue en base, avec ses occurrences.
 * @returns La playlist sous sa forme publique.
 * @throws {Error} Si la version stockée est inférieure à 1 ou trop grande pour être un nombre exact
 *   : cela signale une donnée incohérente.
 */
export function toPlaylist(row: PlaylistRow): Playlist {
  if (row.version < 1n || row.version > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Unsupported playlist version')
  }
  return {
    id: row.id,
    ...(row.ownerUserId ? { ownerUserId: row.ownerUserId } : {}),
    ...(row.createdAt ? { createdAt: row.createdAt.toISOString() } : {}),
    ...(row.updatedAt ? { updatedAt: row.updatedAt.toISOString() } : {}),
    ...(row.coverAssetId !== undefined ? { coverAssetId: row.coverAssetId } : {}),
    name: row.name,
    description: row.description ?? '',
    visibility: row.visibility === 'public' ? 'public' : 'private',
    version: Number(row.version),
    items: row.items.map(({ id, trackId, position, addedAt }) => ({
      id,
      trackId,
      position,
      ...(addedAt ? { addedAt: addedAt.toISOString() } : {}),
    })),
  }
}
