/** Client HTTP interne Auth → Users ; la même demande peut être rejouée après une réponse perdue. */
import {
  PermanentProfileProvisionError,
  type PermanentProvisionCode,
  type ProfileProvisioner,
  profileProvisionType,
} from "./handle-profile-creation-result.js";

/** Signature de fetch injectable pour tester les échanges HTTP sans contacter un serveur réel. */
type Fetch = typeof fetch;

/** Adresse de Users, secret interne, délai en millisecondes et implémentation HTTP à utiliser. */
type HttpProfileProvisionerOptions = {
  /** Implémentation HTTP injectable afin de contrôler les échanges dans les tests. */
  fetchImpl?: Fetch;
  /** Secret partagé entre services pour les routes internes ; distinct du JWT utilisateur. */
  internalServiceToken: string;
  /** Délai maximal de l’échange HTTP en millisecondes. */
  timeoutMs?: number;
  /** Adresse interne de Users utilisée pour livrer une demande de profil. */
  userServiceUrl: string;
};

/** Reconnaît uniquement les deux codes de conflit définis par le contrat de création du profil. */
function isPermanentProvisionCode(
  value: unknown,
): value is PermanentProvisionCode {
  return value === "USERNAME_TAKEN" || value === "PROFILE_CONFLICT";
}

/**
 * Construit l’envoi PUT interne avec identité stable, token de service et délai borné. Un succès
 * confirme la livraison ; seuls les conflits 409 connus sont définitifs. Les autres refus et pannes
 * sont rejetés pour permettre une nouvelle tentative.
 */
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
