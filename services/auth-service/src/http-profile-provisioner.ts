import {
  PermanentProfileProvisionError,
  type PermanentProvisionCode,
  type ProfileProvisioner,
  profileProvisionType,
} from "./provisioning.js";

type Fetch = typeof fetch;

type HttpProfileProvisionerOptions = {
  fetchImpl?: Fetch;
  internalServiceToken: string;
  timeoutMs?: number;
  userServiceUrl: string;
};

function isPermanentProvisionCode(
  value: unknown,
): value is PermanentProvisionCode {
  return value === "USERNAME_TAKEN" || value === "PROFILE_CONFLICT";
}

export function createHttpProfileProvisioner({
  fetchImpl = fetch,
  internalServiceToken,
  timeoutMs = 3000,
  userServiceUrl,
}: HttpProfileProvisionerOptions): ProfileProvisioner {
  const baseUrl = userServiceUrl.replace(/\/$/, "");

  return async (message) => {
    const response = await fetchImpl(
      `${baseUrl}/internal/profiles/${encodeURIComponent(message.userId)}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${internalServiceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          eventId: message.eventId,
          type: profileProvisionType,
          schemaVersion: 1,
          aggregateId: message.userId,
          aggregateVersion: message.aggregateVersion,
          occurredAt: message.occurredAt,
          data: {
            displayName: message.displayName,
            username: message.username,
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );

    if (response.ok) {
      return;
    }

    if (response.status === 409) {
      const body: unknown = await response.json().catch(() => null);
      const code =
        typeof body === "object" && body !== null && "code" in body
          ? body.code
          : undefined;

      if (isPermanentProvisionCode(code)) {
        throw new PermanentProfileProvisionError(code);
      }
    }

    throw new Error(`user-service returned HTTP ${response.status}`);
  };
}
