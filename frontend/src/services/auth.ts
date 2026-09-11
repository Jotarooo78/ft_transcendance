import type {
  AuthenticatedUser,
  LoginRequest,
  RegisterRequest,
  RegisteredUser,
} from "../types/auth";

const mockUser: AuthenticatedUser = {
  id: "mock-user-1",
  username: "test",
  email: "test@test.fr",
  createdAt: "2026-09-01T10:00:00.000Z",
};

export async function registerUser(
  request: RegisterRequest,
): Promise<RegisteredUser> {
  // Simulation d'une attente réseau
  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });

  // Simulation d'une erreur du backend
  if (request.email === "existing@example.com") {
    throw new Error("An account already exists with this email.");
  }

  return {
    id: crypto.randomUUID(),
    username: request.username,
    email: request.email,
  };
}

export async function loginUser(
  request: LoginRequest,
): Promise<AuthenticatedUser> {
  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });

  const normalizedEmail = request.email.trim().toLowerCase();

  const credentialsAreValid =
    normalizedEmail === mockUser.email && request.password === "password1234";

  if (!credentialsAreValid) {
    throw new Error("Invalid email or password.");
  }

  return mockUser;
}
