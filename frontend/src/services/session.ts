let accessToken: string | null = null;

type SessionClearedListener = () => void;

const sessionClearedListeners = new Set<SessionClearedListener>();

export function onSessionCleared(listener: SessionClearedListener): () => void {
  sessionClearedListeners.add(listener);

  return () => {
    sessionClearedListeners.delete(listener);
  };
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;

  for (const listener of sessionClearedListeners) {
    listener();
  }
}
