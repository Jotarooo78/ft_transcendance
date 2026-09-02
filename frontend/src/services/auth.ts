export type RegisterRequest = {
  displayName: string;
  email: string;
  password: string;
  accountType: "listener" | "artist";
};

export type RegisteredUser = {
  id: string;
  displayName: string;
  email: string;
  accountType: "listener" | "artist";
};

export async function registerUser(
  request: RegisterRequest,
): Promise<RegisteredUser> {
// Simulation attente reseau
  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });
// Simulation erreur backend
  if (request.email === "existing@example.com") {
    throw new Error("An account already exists with this email.");
  }

  return {
    id: crypto.randomUUID(),
    displayName: request.displayName,
    email: request.email,
    accountType: request.accountType,
  };
}