/**
 * @file errors.ts
 * @brief Liste des refus que auth-service peut opposer à une demande.
 *
 * @details Chaque refus est une petite fonction au nom parlant, qui fabrique l'erreur
 *   correspondante. Le client reçoit le statut HTTP et le message définis ici, sous la forme `{
 *   "error": "..." }`, parfois accompagnés d'un champ `code`.
 *
 * Les textes et les codes de ce fichier sont lus par le frontend et comparés par les tests : il ne
 * faut pas les modifier.
 */

import { DomainError } from '@ft/service-kit'
import type { PermanentProvisionCode } from './registration.js'

// Les textes et les codes de ce fichier font partie du contrat lu par le frontend et les tests.

/**
 * @brief Crée l'erreur 400 d'une inscription dont un champ est invalide.
 * @details Le message est le même quel que soit le champ fautif : il rappelle toutes les règles
 *   d'un coup.
 */
export const invalidSignup = () =>
  new DomainError(400, 'valid email, password (8-128 chars), username and displayName required')
/** @brief Crée l'erreur 400 d'une connexion à laquelle il manque l'email ou le mot de passe. */
export const invalidLogin = () => new DomainError(400, 'email and password required')
/**
 * @brief Crée l'erreur 401 « identifiants invalides ».
 * @details La réponse est volontairement identique pour un email inconnu et pour un mot de passe
 *   faux. Sinon, n'importe qui pourrait découvrir quels emails ont un compte.
 */
export const invalidCredentials = () => new DomainError(401, 'invalid credentials')

/**
 * @brief Crée l'erreur 409 « un compte existe déjà avec cet email », de code
 *   `ACCOUNT_ALREADY_EXISTS`.
 */
export const accountAlreadyExists = () =>
  new DomainError(409, 'email already registered', { code: 'ACCOUNT_ALREADY_EXISTS' })
/**
 * @brief Crée l'erreur 409 « le profil de ce compte n'a pas pu être créé », de code
 *   `REGISTRATION_FAILED`.
 * @details Elle est renvoyée à la connexion quand le compte existe mais que user-service a
 *   définitivement refusé son profil.
 */
export const registrationFailed = () =>
  new DomainError(409, 'profile provisioning failed', { code: 'REGISTRATION_FAILED' })

/**
 * @brief Crée l'erreur d'une inscription dont user-service a définitivement refusé le profil.
 * @param code Raison donnée par user-service : `USERNAME_TAKEN` (username déjà pris) ou
 *   `PROFILE_CONFLICT`.
 * @returns Une erreur 409 portant ce code.
 */
export function profileRefused(code: PermanentProvisionCode) {
  const message =
    code === 'USERNAME_TAKEN'
      ? 'username already registered'
      : 'profile conflicts with an existing registration'
  return new DomainError(409, message, { code })
}
