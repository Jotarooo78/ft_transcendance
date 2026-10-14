/**
 * @file profile.ts
 * @brief Définition d'un profil utilisateur et vérification des données envoyées pour le modifier.
 *
 * @details Le dossier `domain/` décrit le métier sans rien de technique : ni HTTP, ni base de
 *   données. Un profil existe sous deux formes : la forme complète, que seul son propriétaire
 *   reçoit, et la forme publique, visible par tous, qui ne contient pas la bio.
 */

import { isRecord } from '@ft/service-kit'
import { invalidBio, invalidDisplayName, invalidUsername } from './errors.js'
import { normalizeUsername } from './identifiers.js'

/**
 * @brief Profil complet, tel que son propriétaire le reçoit.
 * @details Il ne contient ni email ni mot de passe : ces données restent dans auth-service.
 */
export type Profile = {
  /** @brief UUID du compte, le même que dans Auth. */
  userId: string
  /** @brief Nom affiché. */
  displayName: string
  /** @brief Identifiant public unique, en minuscules. */
  username: string
  /** @brief Présentation facultative. */
  bio: string | null
  /** @brief URL publique de l'avatar, ou null. */
  avatarUrl: string | null
}

/** @brief Profil tel que n'importe qui peut le voir : le profil complet sans la bio. */
export type PublicProfile = Pick<Profile, 'userId' | 'displayName' | 'username' | 'avatarUrl'>

/** @brief Les trois champs qu'un utilisateur peut modifier : nom affiché, username et bio. */
export type ProfileUpdate = Pick<Profile, 'displayName' | 'username' | 'bio'>

/** @brief Longueur maximale du nom affiché, en caractères. */
const maxDisplayNameLength = 60
/** @brief Longueur maximale de la bio, en caractères. */
const maxBioLength = 160

/**
 * @brief Nettoie un nom affiché et vérifie sa longueur.
 * @param value Valeur saisie, de n'importe quel type.
 * @returns Le nom sans espaces au début ni à la fin, ou null s'il n'est pas un texte de 1 à 60
 *   caractères.
 */
export function cleanDisplayName(value: unknown): string | null {
  const displayName = typeof value === 'string' ? value.trim() : ''
  return displayName && displayName.length <= maxDisplayNameLength ? displayName : null
}

/**
 * @brief Nettoie une bio et vérifie sa longueur.
 * @param value Valeur saisie : null (pas de bio) ou un texte.
 * @returns La bio sans espaces au début ni à la fin. Une bio vide devient null.
 * @throws {DomainError} 400 si la valeur est absente, n'est ni null ni un texte, ou dépasse 160
 *   caractères.
 */
function cleanBio(value: unknown): string | null {
  if (value === null) {
    return null
  }
  if (typeof value !== 'string' || value.trim().length > maxBioLength) {
    throw invalidBio()
  }
  return value.trim() || null
}

/**
 * @brief Vérifie les données envoyées pour modifier un profil.
 * @details Les trois champs sont obligatoires et vérifiés dans l'ordre nom affiché, username, bio :
 *   le premier champ invalide détermine le message d'erreur. Les autres champs éventuellement
 *   présents dans le corps sont ignorés.
 * @param body Corps de la requête, non encore vérifié.
 * @returns Les trois champs nettoyés, prêts à être enregistrés.
 * @throws {DomainError} 400 avec le message correspondant au champ invalide.
 */
export function toProfileUpdate(body: unknown): ProfileUpdate {
  const fields = isRecord(body) ? body : {}
  const displayName = cleanDisplayName(fields.displayName)
  if (displayName === null) {
    throw invalidDisplayName()
  }
  const username = normalizeUsername(fields.username)
  if (username === null) {
    throw invalidUsername()
  }
  return { displayName, username, bio: cleanBio(fields.bio) }
}

/**
 * @brief Réduit un profil à ses cinq champs officiels.
 * @details L'objet lu en base peut porter d'autres colonnes. Cette fonction garantit que seuls
 *   `userId`, `displayName`, `username`, `bio` et `avatarUrl` partent vers le client.
 * @param row Profil lu en base.
 * @returns Le profil réduit à ses cinq champs.
 */
export function toProfile(row: Profile): Profile {
  const { userId, displayName, username, bio, avatarUrl } = row
  return { userId, displayName, username, bio, avatarUrl }
}
