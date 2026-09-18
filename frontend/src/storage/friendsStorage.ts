const STORAGE_KEY = "ft-music:friend-ids:v1";

export function loadFriendIds(): string[] {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY);

    if (storedValue === null) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    const isValid = parsedValue.every(
      (value: unknown) => typeof value === "string",
    );

    return isValid ? (parsedValue as string[]) : [];
  } catch {
    return [];
  }
}

export function saveFriendIds(friendIds: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(friendIds));
  } catch (error) {
    console.error("Unable to save friends locally:", error);
  }
}
