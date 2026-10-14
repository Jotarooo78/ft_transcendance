/**
 * @file identifiers.ts
 * @brief Vérification du format des deux identifiants manipulés par le service : l'identifiant de
 *   compte (UUID) et le username.
 *
 * @details Un UUID est un identifiant de 36 caractères généré au hasard, de la forme
 *   `3f2b8c1e-...`. Chaque compte en reçoit un à l'inscription, et tous les services l'utilisent
 *   pour désigner ce compte. Le username est le nom unique choisi par l'utilisateur.
 */

/** @brief Expression régulière décrivant la forme d'un UUID. */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * @brief Dit si une valeur a la forme d'un UUID.
 * @param value Valeur à tester, de n'importe quel type.
 * @returns Vrai si c'est un texte au format UUID.
 */
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && uuidPattern.test(value)

/**
 * @brief Expression régulière décrivant un username valide : 3 à 24 caractères parmi a-z, 0-9 et
 *   `_`.
 */
const usernamePattern = /^[a-z0-9_]{3,24}$/

/**
 * @brief Met un username sous sa forme de référence et vérifie son format.
 * @details Les espaces autour sont retirés et les majuscules converties en minuscules : « Alice »
 *   et « alice » désignent donc le même username.
 * @param value Valeur saisie, de n'importe quel type.
 * @returns Le username normalisé, ou null si la valeur n'est pas un username valide.
 */
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const username = value.trim().toLowerCase()
  return usernamePattern.test(username) ? username : null
}
