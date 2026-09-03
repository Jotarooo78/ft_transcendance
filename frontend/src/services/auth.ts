import type {
  RegisterRequest,
  RegisteredUser,
} from "../types/auth";

export async function registerUser(
  request: RegisterRequest,
): Promise<RegisteredUser> {
  // Simulation d'une attente réseau
  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });

  // Simulation d'une erreur du backend
  if (request.email === "existing@example.com") {
    throw new Error(
      "An account already exists with this email.",
    );
  }

  return {
    id: crypto.randomUUID(),
    displayName: request.displayName,
    email: request.email,
    accountType: request.accountType,
  };
}