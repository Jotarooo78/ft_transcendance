const usernamePattern = /^[a-z0-9_]{3,24}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isCanonicalUsername(value: string): boolean {
  return usernamePattern.test(value);
}

export const usernameErrorMessage =
  "Username must contain 3 to 24 lowercase letters, numbers, or underscores.";
