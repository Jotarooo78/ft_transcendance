/**
 * @file profiles.schema.ts
 * @brief Schémas des réponses de profil et des parties variables des URL.
 *
 * @details Un schéma de réponse sert de filtre : seuls les champs qu'il liste sont envoyés au
 *   client, même si l'objet renvoyé par le code en contient d'autres.
 *
 * Contrairement aux autres services, les corps de requête ne sont pas décrits ici. Ils sont
 * vérifiés à la main dans `domain/`, parce que ce service doit renvoyer un message d'erreur précis
 * pour chaque champ.
 */

import { Type } from 'typebox'

/** @brief Schéma d'un champ qui vaut soit un texte, soit null. */
const nullableString = Type.Union([Type.String(), Type.Null()])

/** @brief Forme du profil complet renvoyé à son propriétaire. */
export const ProfileSchema = Type.Object({
  userId: Type.String(),
  displayName: Type.String(),
  username: Type.String(),
  bio: nullableString,
  avatarUrl: nullableString,
})

/** @brief Forme du profil public, sans la bio. */
export const PublicProfileSchema = Type.Object({
  userId: Type.String(),
  displayName: Type.String(),
  username: Type.String(),
  avatarUrl: nullableString,
})

// Paramètres d'URL : leur format est contrôlé dans domain/, avec le message d'erreur du contrat.
/**
 * @brief Partie variable `:userId` d'une URL : un texte, dont le format est vérifié ensuite par le
 *   contrôleur.
 */
export const UserIdParamsSchema = Type.Object({ userId: Type.String() })
/** @brief Partie variable `:friendId` d'une URL. */
export const FriendIdParamsSchema = Type.Object({ friendId: Type.String() })
/** @brief Partie variable `:fileName` de l'URL d'un avatar. */
export const FileNameParamsSchema = Type.Object({ fileName: Type.String() })
