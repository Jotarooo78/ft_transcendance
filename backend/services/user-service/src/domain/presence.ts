/**
 * @file presence.ts
 * @brief Calcul de l'état « en ligne » ou « hors ligne » d'un utilisateur.
 *
 * @details Fonctionnement : tant que le site est ouvert, le navigateur envoie régulièrement un «
 *   signe de vie » (heartbeat). Le serveur note l'heure du dernier. Un utilisateur est considéré en
 *   ligne s'il s'est déclaré présent et que son dernier signe de vie date de moins de 2 minutes.
 */

/**
 * @brief Dernier signe de vie enregistré pour un compte : s'est-il déclaré présent, et quand a-t-il
 *   été vu pour la dernière fois.
 */
export type Presence = { isOnline: boolean; lastSeenAt: Date }
/** @brief État affiché d'un compte : `online` ou `offline`. */
export type OnlineStatus = 'online' | 'offline'

/**
 * @brief Durée sans signe de vie au-delà de laquelle un compte est considéré hors ligne : 2
 *   minutes, en millisecondes.
 */
const onlineWindowMs = 120 * 1000

/**
 * @brief Dit si un compte est en ligne.
 * @details Les deux conditions sont nécessaires. Si l'utilisateur ferme son onglet brutalement, le
 *   navigateur n'a pas le temps de le déclarer hors ligne ; grâce au délai de 2 minutes, il passe
 *   quand même hors ligne tout seul.
 * @param presence Dernier signe de vie, ou rien si le compte n'en a jamais donné.
 * @param now Heure courante en millisecondes ; les tests la fournissent.
 * @returns `online` ou `offline`.
 */
export function onlineStatus(
  presence: Presence | null | undefined,
  now = Date.now()
): OnlineStatus {
  const isRecent = presence ? now - presence.lastSeenAt.getTime() <= onlineWindowMs : false
  return presence?.isOnline && isRecent ? 'online' : 'offline'
}
