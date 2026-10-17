import type {
  AuthenticatedUser,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  LoginResponse,
  ProfileResponse,
} from "../types/auth";

import { authenticatedFetch } from "./api";
import { getAccessToken, readTokenClaims, setAccessToken } from "./session";

export async function registerUser(
  request: RegisterRequest,
): Promise<RegisterResponse> {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to create account.");
  }

  return data;
}

export async function requestLogin(
  request: LoginRequest,
): Promise<LoginResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to log in.");
  }

  return data;
}

export async function getMyProfile(token: string): Promise<ProfileResponse> {
  const response = await fetch("/api/users/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to load profile.");
  }

  return data;
}

export async function loginUser(
  request: LoginRequest,
): Promise<AuthenticatedUser> {
  const email = request.email.trim().toLowerCase();

  const result = await requestLogin({
    email,
    password: request.password,
  });

  if (!("token" in result)) {
    throw new Error(
      `Your registration is still in progress. Try again in ${result.retryAfterSeconds} seconds.`,
    );
  }

  const profile = await getMyProfile(result.token);

  setAccessToken(result.token);

  return toAuthenticatedUser(profile, email);
}

/** Assemble l'utilisateur courant à partir de son profil et de son adresse e-mail. */
function toAuthenticatedUser(
  profile: ProfileResponse,
  email: string,
): AuthenticatedUser {
  return {
    id: profile.userId,
    displayName: profile.displayName,
    username: profile.username,
    email,
    // Conserve null pour une bio absente, conformément au contrat Users.
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    createdAt: null,
  };
}

/**
 * Reconnecte l'onglet après un rechargement, à partir du jeton gardé dans `sessionStorage`.
 * Le profil est relu sur le serveur : c'est lui qui confirme que le jeton est toujours valable. Un
 * jeton refusé (401) est effacé par `authenticatedFetch`, et la page de connexion s'affiche.
 * @returns L'utilisateur connecté, ou null si l'onglet n'avait pas de session.
 * @throws {Error} Si le serveur est injoignable ou refuse le jeton.
 */
export async function restoreSession(): Promise<AuthenticatedUser | null> {
  const token = getAccessToken();
  if (token === null) return null;

  const response = await authenticatedFetch("/api/users/me");
  const data = (await response.json().catch(() => null)) as
    ProfileResponse | { error?: string } | null;
  if (!response.ok || data === null || !("userId" in data))
    throw new Error("Unable to restore your session.");

  // Un autre compte a pu se connecter pendant la lecture : on ne mélange pas les deux.
  if (getAccessToken() !== token)
    throw new Error("Your session changed. Please sign in again.");

  return toAuthenticatedUser(data, readTokenClaims(token)?.email ?? "");
}
