/**
 * @file registration.ts
 * @brief Définitions liées à l'inscription : les états d'un compte et la demande de création de
 *   profil.
 *
 * @details Le problème à résoudre : un utilisateur est décrit dans deux services. Auth garde son
 *   email et son mot de passe ; Users garde son profil (nom affiché, username). S'inscrire demande
 *   donc d'écrire dans deux bases différentes, et la seconde écriture peut échouer (Users en panne,
 *   réseau coupé).
 *
 * La solution : Auth crée le compte dans l'état `pending_profile` (« en attente de profil ») et
 * enregistre en même temps, dans sa propre base, une demande « créer le profil de ce compte ». Il
 * envoie ensuite cette demande à Users. Si Users confirme, le compte passe à `active` et peut se
 * connecter. Si Users ne répond pas, la demande reste en base et sera renvoyée plus tard. Si Users
 * refuse définitivement (username déjà pris), le compte passe à `profile_failed`.
 *
 * Dans le code, cette demande s'appelle une « provision » de profil.
 */

/**
 * @brief Nom et version du type de demande. Auth et Users doivent utiliser exactement la même
 *   valeur.
 */
export const profileProvisionType = 'ProfileProvisionRequested.v1'

/** @brief Les trois états possibles d'un compte : en attente de profil, actif, ou profil refusé. */
export type AccountState = 'pending_profile' | 'active' | 'profile_failed'

/**
 * @brief Un compte tel qu'il est lu en base au moment d'une connexion.
 * @details `passwordHash` est l'empreinte du mot de passe, jamais le mot de passe lui-même.
 */
export type Account = { id: string; email: string; passwordHash: string; state: AccountState }

/**
 * @brief Données nécessaires pour créer un compte. Le mot de passe a déjà été transformé en
 *   empreinte.
 */
export type NewRegistration = {
  /** @brief Email normalisé, en minuscules. */
  email: string
  /** @brief Empreinte argon2 du mot de passe ; jamais le mot de passe lui-même. */
  passwordHash: string
  /** @brief Nom affiché du futur profil. */
  displayName: string
  /** @brief Username canonique du futur profil. */
  username: string
}

/**
 * @brief Une demande de création de profil, gardée en base jusqu'à ce que Users l'ait confirmée.
 */
export type ProfileProvision = {
  /** @brief Identité stable de la demande : Users s'en sert pour ne la traiter qu'une fois. */
  eventId: string
  /** @brief UUID du compte. */
  userId: string
  /** @brief Version du compte, 1 à la création. */
  aggregateVersion: number
  /** @brief Date de la demande, au format ISO. */
  occurredAt: string
  /** @brief Nom affiché du profil à créer. */
  displayName: string
  /** @brief Username canonique du profil à créer. */
  username: string
  /** @brief Nombre de livraisons déjà tentées. */
  attempts: number
}

/** @brief Les deux raisons pour lesquelles Users peut refuser définitivement un profil. */
export type PermanentProvisionCode = 'USERNAME_TAKEN' | 'PROFILE_CONFLICT'

/**
 * @brief Dit si une valeur reçue de Users est l'une des deux raisons de refus définitif.
 * @param value Code reçu dans la réponse de Users.
 * @returns Vrai pour `USERNAME_TAKEN` ou `PROFILE_CONFLICT`.
 */
export const isPermanentProvisionCode = (value: unknown): value is PermanentProvisionCode =>
  value === 'USERNAME_TAKEN' || value === 'PROFILE_CONFLICT'

/**
 * @brief Erreur levée par le client de Users quand celui-ci refuse définitivement de créer le
 *   profil.
 * @details Elle se distingue d'une simple panne : après une panne on réessaie, après ce refus on
 *   abandonne.
 */
export class PermanentProvisionError extends Error {
  /**
   * @brief Construit l'erreur.
   * @param code Raison du refus.
   */
  constructor(readonly code: PermanentProvisionCode) {
    super(code)
    this.name = 'PermanentProvisionError'
  }
}

/**
 * @brief Résultat d'un envoi de demande à Users.
 * @details `delivered` : Users a créé le profil. `pending` : l'envoi a échoué, il faudra réessayer.
 *   `permanent_failure` : Users a refusé, inutile de réessayer.
 */
export type DeliveryResult =
  | { status: 'delivered' }
  | { status: 'pending' }
  | { status: 'permanent_failure'; code: PermanentProvisionCode }

/**
 * @brief Calcule à quelle heure réessayer un envoi qui vient d'échouer.
 * @details L'attente double à chaque échec : 2 secondes, puis 4, 8, 16, 32, et au maximum 60. On
 *   insiste ainsi rapidement au début, sans harceler un service en panne durable.
 * @param attempts Nombre d'échecs, en comptant celui qui vient de se produire.
 * @param now Heure courante en millisecondes ; les tests la fournissent.
 * @returns La date à partir de laquelle un nouvel essai est permis.
 */
export function nextAttemptAt(attempts: number, now = Date.now()): Date {
  const delaySeconds = Math.min(60, 2 ** Math.min(attempts, 6))
  return new Date(now + delaySeconds * 1000)
}
