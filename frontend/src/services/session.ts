/**
 * Jeton de connexion (JWT) du compte connecté dans cet onglet.
 *
 * Il est gardé en mémoire et recopié dans `sessionStorage`, pour survivre à un rechargement de la
 * page. `sessionStorage` est propre à chaque onglet : deux onglets peuvent être connectés à deux
 * comptes différents, et fermer l'onglet oublie la session. (`localStorage`, lui, serait partagé par
 * tous les onglets : un seul compte possible.)
 *
 * Le stockage peut être bloqué (navigation privée stricte, cookies désactivés) : la session reste
 * alors seulement en mémoire, comme avant, et un rechargement demande de se reconnecter.
 */

/** Clé du jeton dans `sessionStorage`. */
const STORAGE_KEY = "ft_access_token";

/** Informations lisibles dans le jeton ; le serveur reste seul juge de sa validité. */
export type TokenClaims = {
  /** Identifiant du compte. */
  sub: string;
  /** Adresse e-mail du compte. */
  email?: string;
  /** Date d'expiration, en secondes depuis le 1er janvier 1970. */
  exp?: number;
};

/**
 * Lit le contenu d'un JWT sans vérifier sa signature : sert seulement à l'affichage et à écarter un
 * jeton déjà expiré. La vérification réelle est faite par chaque service.
 * @returns Le contenu, ou null si le jeton est mal formé.
 */
export function readTokenClaims(token: string): TokenClaims | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
    );
    const claims: unknown = JSON.parse(json);
    if (
      !claims ||
      typeof claims !== "object" ||
      !("sub" in claims) ||
      typeof claims.sub !== "string"
    )
      return null;
    return claims as TokenClaims;
  } catch {
    return null;
  }
}

/** Vrai si le jeton est expiré (ou expire dans les 10 prochaines secondes). */
function isExpired(token: string): boolean {
  const exp = readTokenClaims(token)?.exp;
  return typeof exp === "number" && exp * 1000 <= Date.now() + 10_000;
}

/** Lit le jeton de l'onglet au chargement ; un jeton illisible ou expiré est oublié. */
function readStoredToken(): string | null {
  try {
    const token = globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? null;
    if (token && (readTokenClaims(token) === null || isExpired(token))) {
      globalThis.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

/** Recopie le jeton dans le stockage de l'onglet, ou l'en retire. */
function writeStoredToken(token: string | null): void {
  try {
    if (token === null) globalThis.sessionStorage?.removeItem(STORAGE_KEY);
    else globalThis.sessionStorage?.setItem(STORAGE_KEY, token);
  } catch {
    // Stockage bloqué : la session reste en mémoire seulement.
  }
}

let accessToken: string | null = readStoredToken();

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
  writeStoredToken(token);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;
  writeStoredToken(null);

  for (const listener of sessionClearedListeners) {
    listener();
  }
}
