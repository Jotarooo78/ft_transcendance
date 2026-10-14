/**
 * @file provision.ts
 * @brief Vérification de la demande de création de profil envoyée par auth-service.
 *
 * @details Le contexte : un compte (email, mot de passe) est créé par auth-service, mais son profil
 *   (nom affiché, username) vit ici, dans user-service. À chaque inscription, auth-service envoie
 *   donc à user-service une demande « crée le profil de ce compte ». Dans le code, cette demande
 *   s'appelle une commande de « provision ».
 *
 * Chaque demande porte un identifiant unique, `eventId`. Si auth-service n'a pas reçu la réponse
 * (coupure réseau) et renvoie la même demande, user-service la reconnaît à cet identifiant et ne
 * crée pas le profil une seconde fois.
 */

import { isRecord } from '@ft/service-kit'
import { invalidProvisionCommand } from './errors.js'
import { isUuid, normalizeUsername } from './identifiers.js'

/**
 * @brief Nom et version du type de demande. Auth et Users doivent utiliser exactement la même
 *   valeur.
 */
export const profileProvisionType = 'ProfileProvisionRequested.v1'

/** @brief Demande de création de profil, une fois vérifiée. */
export type ProfileProvisionCommand = {
  /** @brief Identité de la commande : la rejouer ne crée pas un second profil. */
  eventId: string
  /** @brief Type de la commande. */
  type: typeof profileProvisionType
  /** @brief Version du format de la commande. */
  schemaVersion: 1
  /** @brief UUID du compte. */
  aggregateId: string
  /** @brief Version du compte côté Auth. */
  aggregateVersion: number
  /** @brief Date de la demande, au format ISO. */
  occurredAt: string
  /** @brief Champs du profil à créer. */
  data: { displayName: string; username: string }
}

/**
 * @brief Résultat d'une demande : `created` si le profil vient d'être créé, `already_processed` si
 *   cette demande avait déjà été traitée.
 */
export type ProvisionResult = { status: 'created' | 'already_processed' }

/** @brief Dit si une valeur est un nombre entier d'au moins 1. */
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

/** @brief Dit si une valeur est un texte représentant une date valide. */
const isDate = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

/**
 * @brief Dit si une valeur est un nom affiché déjà nettoyé : un texte de 1 à 60 caractères sans
 *   espaces au début ni à la fin.
 */
const isDisplayName = (value: unknown): value is string =>
  typeof value === 'string' && value === value.trim() && value.length >= 1 && value.length <= 60

/**
 * @brief Vérifie une demande de création de profil reçue d'auth-service.
 * @details Chaque champ est contrôlé un par un. L'identifiant de compte présent dans l'URL doit
 *   être le même que celui de la demande, pour qu'une demande ne puisse pas créer le profil d'un
 *   autre compte que celui annoncé.
 * @param body Corps de la requête, non encore vérifié.
 * @param userId Identifiant du compte lu dans l'URL.
 * @returns La demande, avec ses identifiants en minuscules.
 * @throws {DomainError} 400 `invalid profile provision command` au moindre champ invalide.
 */
export function toProvisionCommand(body: unknown, userId: string): ProfileProvisionCommand {
  const data = isRecord(body) && isRecord(body.data) ? body.data : null
  const username = normalizeUsername(data?.username)
  const isValid =
    isRecord(body) &&
    data !== null &&
    isUuid(body.eventId) &&
    body.type === profileProvisionType &&
    body.schemaVersion === 1 &&
    isUuid(body.aggregateId) &&
    body.aggregateId === userId &&
    isPositiveInteger(body.aggregateVersion) &&
    isDate(body.occurredAt) &&
    isDisplayName(data.displayName) &&
    username !== null
  if (!isValid) {
    throw invalidProvisionCommand()
  }
  return {
    eventId: body.eventId as string,
    type: profileProvisionType,
    schemaVersion: 1,
    aggregateId: userId,
    aggregateVersion: body.aggregateVersion as number,
    occurredAt: body.occurredAt as string,
    data: { displayName: data.displayName as string, username: username as string },
  }
}
