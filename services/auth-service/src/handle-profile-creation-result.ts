export const profileProvisionType = "ProfileProvisionRequested.v1";

export type PendingProfileProvision = {
  eventId: string;
  userId: string;
  aggregateVersion: number;
  occurredAt: string;
  displayName: string;
  username: string;
  attempts: number;
};

export type AccountForLogin = {
  id: string;
  email: string;
  passwordHash: string;
  state: "pending_profile" | "active" | "profile_failed";
};

export type CreateRegistrationInput = {
  email: string;
  passwordHash: string;
  displayName: string;
  username: string;
};

export type CreatedRegistration = {
  account: {
    id: string;
    email: string;
  };
  message: PendingProfileProvision;
};

export interface RegistrationStore {
  checkReady(): Promise<void>;
  createPendingRegistration(
    input: CreateRegistrationInput,
  ): Promise<CreatedRegistration>;
  findAccountByEmail(email: string): Promise<AccountForLogin | null>;
  listPendingProvisions(limit: number): Promise<PendingProfileProvision[]>;
  markProvisionAttemptFailed(
    message: PendingProfileProvision,
    errorCode: string,
  ): Promise<void>;
  markProvisioned(message: PendingProfileProvision): Promise<void>;
  markProvisionPermanentlyFailed(
    message: PendingProfileProvision,
    errorCode: PermanentProvisionCode,
  ): Promise<void>;
}

export type ProfileProvisioner = (
  message: PendingProfileProvision,
) => Promise<void>;

export type PermanentProvisionCode =
  | "USERNAME_TAKEN"
  | "PROFILE_CONFLICT";

export class DuplicateEmailError extends Error {
  constructor() {
    super("email already registered");
    this.name = "DuplicateEmailError";
  }
}

export class PermanentProfileProvisionError extends Error {
  constructor(public readonly code: PermanentProvisionCode) {
    super(code);
    this.name = "PermanentProfileProvisionError";
  }
}

export type DeliveryResult =
  | { status: "delivered" }
  | { status: "pending" }
  | { status: "permanent_failure"; code: PermanentProvisionCode };

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && error.name) {
    return error.name.slice(0, 80);
  }
  return "UnknownProvisionError";
}

export async function deliverProfileProvision(
  store: RegistrationStore,
  provisionProfile: ProfileProvisioner,
  message: PendingProfileProvision,
): Promise<DeliveryResult> {
  try {
    await provisionProfile(message);
    await store.markProvisioned(message);
    return { status: "delivered" };
  } catch (error) {
    if (error instanceof PermanentProfileProvisionError) {
      await store.markProvisionPermanentlyFailed(message, error.code);
      return { status: "permanent_failure", code: error.code };
    }

    await store.markProvisionAttemptFailed(message, safeErrorCode(error));
    return { status: "pending" };
  }
}
