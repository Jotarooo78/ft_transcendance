import type {
  AuthenticatedUser,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  LoginResponse,
  ProfileResponse,
} from "../types/auth";

import { setAccessToken } from "./session";

export async function registerUser(
  request: RegisterRequest
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
  request: LoginRequest
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

// export async function loginUser(
//   request: LoginRequest
// ): Promise<AuthenticatedUser> {
//   await new Promise((resolve) => {
//     setTimeout(resolve, 1000);
//   });

//   const normalizedEmail = request.email.trim().toLowerCase();

//   const credentialsAreValid =
//     normalizedEmail === mockUser.email && request.password === "password1234";

//   if (!credentialsAreValid) {
//     throw new Error("Invalid email or password.");
//   }

//   return mockUser;
// }

export async function loginUser(
  request: LoginRequest
): Promise<AuthenticatedUser> {
  const email = request.email.trim().toLowerCase();

  const result = await requestLogin({
    email,
    password: request.password,
  });

  if (!("token" in result)) {
    throw new Error(
      `Your registration is still in progress. Try again in ${result.retryAfterSeconds} seconds.`
    );
  }

  const profile = await getMyProfile(result.token);

  setAccessToken(result.token);

  return {
    id: profile.userId,
    displayName: profile.displayName,
    username: profile.username,
    email,
    bio: null,
    avatarUrl: profile.avatarUrl,
    createdAt: null,
  };
}
