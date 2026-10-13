const usernamePattern = /^[a-z0-9_]{3,24}$/;

/** Supprime les espaces extérieurs et passe en minuscules avant l’envoi du username. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Vérifie le format canonique a-z, 0-9 et _, de 3 à 24 caractères, sans modifier la valeur. */
export function isCanonicalUsername(value: string): boolean {
  return usernamePattern.test(value);
}

/** Message associé au contrat canonique du username, partagé par les validations frontend. */
export const usernameErrorMessage =
  "Username must contain 3 to 24 lowercase letters, numbers, or underscores.";
