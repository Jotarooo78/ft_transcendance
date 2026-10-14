/**
 * @file credentials.ts
 * @brief Vérification des données saisies à l'inscription et à la connexion.
 *
 * @details Les routes d'auth-service n'utilisent pas de schéma de validation : les données sont
 *   vérifiées ici, à la main, parce que le service doit renvoyer des messages d'erreur précis que
 *   le frontend affiche. Ces fonctions reçoivent le corps brut de la requête (qui peut être
 *   n'importe quoi) et renvoient des données propres, ou lèvent une erreur 400.
 */

import { isRecord } from '@ft/service-kit'
import { invalidLogin, invalidSignup } from './errors.js'

/** @brief Données d'inscription une fois vérifiées et nettoyées. */
export type SignupInput = { email: string; password: string; username: string; displayName: string }
/** @brief Données de connexion une fois nettoyées. */
export type LoginInput = { email: string; password: string }

/**
 * @brief Expression régulière vérifiant qu'un texte ressemble à un email : quelque chose, `@`,
 *   quelque chose, un point, quelque chose. Elle ne prouve pas que l'adresse existe.
 */
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** @brief Expression régulière d'un username valide : 3 à 24 caractères parmi a-z, 0-9 et `_`. */
const usernamePattern = /^[a-z0-9_]{3,24}$/
/** @brief Longueur maximale d'un email, en caractères. */
const maxEmailLength = 254
/** @brief Longueur maximale du nom affiché, en caractères. */
const maxDisplayNameLength = 60

/**
 * @brief Renvoie la valeur si c'est un texte, sinon un texte vide. Cela évite une erreur quand le
 *   client envoie un nombre ou rien du tout.
 */
const text = (value: unknown) => (typeof value === 'string' ? value : '')
/**
 * @brief Met un email sous sa forme de référence : sans espaces autour et en minuscules. «
 *   Alice@Mail.com » et « alice@mail.com » désignent ainsi le même compte.
 */
const normalizeEmail = (value: unknown) => text(value).trim().toLowerCase()

/**
 * @brief Met un username sous sa forme de référence et vérifie son format.
 * @param value Valeur saisie, de n'importe quel type.
 * @returns Le username sans espaces autour et en minuscules, ou null s'il n'est pas valide.
 */
export function normalizeUsername(value: unknown): string | null {
  const username = text(value).trim().toLowerCase()
  return usernamePattern.test(username) ? username : null
}

/** @brief Dit si un email a une forme correcte et ne dépasse pas la longueur maximale. */
const isEmail = (email: string) => emailPattern.test(email) && email.length <= maxEmailLength
/** @brief Dit si un mot de passe fait entre 8 et 128 caractères. */
const isPassword = (password: string) => password.length >= 8 && password.length <= 128

/**
 * @brief Vérifie et nettoie les données d'une inscription.
 * @details L'email et le username sont normalisés, le nom affiché débarrassé de ses espaces autour.
 *   Le mot de passe est gardé exactement tel que saisi.
 * @param body Corps de la requête, non encore vérifié.
 * @returns Les quatre champs prêts à être utilisés.
 * @throws {DomainError} 400 si l'un des champs est absent ou invalide.
 */
export function toSignupInput(body: unknown): SignupInput {
  const fields = isRecord(body) ? body : {}
  const email = normalizeEmail(fields.email)
  const password = text(fields.password)
  const username = normalizeUsername(fields.username)
  const displayName = text(fields.displayName).trim()
  const hasDisplayName = displayName.length >= 1 && displayName.length <= maxDisplayNameLength
  if (!isEmail(email) || !isPassword(password) || username === null || !hasDisplayName) {
    throw invalidSignup()
  }
  return { email, password, username, displayName }
}

/**
 * @brief Nettoie les données d'une connexion.
 * @details Ici on vérifie seulement que les deux champs sont présents. Leur format n'est pas
 *   contrôlé : un email mal formé ne correspondra de toute façon à aucun compte.
 * @param body Corps de la requête, non encore vérifié.
 * @returns L'email normalisé et le mot de passe.
 * @throws {DomainError} 400 si l'email ou le mot de passe est absent.
 */
export function toLoginInput(body: unknown): LoginInput {
  const fields = isRecord(body) ? body : {}
  const email = normalizeEmail(fields.email)
  const password = text(fields.password)
  if (!email || !password) {
    throw invalidLogin()
  }
  return { email, password }
}
