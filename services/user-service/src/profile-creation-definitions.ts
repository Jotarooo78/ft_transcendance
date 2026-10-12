export const profileProvisionType = "ProfileProvisionRequested.v1";

export type ProfileProvisionCommand = {
  eventId: string;
  type: typeof profileProvisionType;
  schemaVersion: 1;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: string;
  data: {
    displayName: string;
    username: string;
  };
};

export type ProfileProvisionResult = {
  status: "created" | "already_processed";
};

export type ProfileProvisioner = (
  command: ProfileProvisionCommand,
) => Promise<ProfileProvisionResult>;

export class UsernameTakenError extends Error {
  constructor() {
    super("username already registered");
    this.name = "UsernameTakenError";
  }
}

export class ProfileConflictError extends Error {
  constructor() {
    super("profile already exists for another command");
    this.name = "ProfileConflictError";
  }
}
