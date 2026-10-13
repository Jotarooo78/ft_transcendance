/** Adaptateur Prisma de l’inscription et de la boîte d’envoi : aucune demande n’est perdue entre création du compte et livraison à Users. */
import { randomUUID } from "node:crypto";

import { Prisma } from "../generated/prisma/client.js";
import {
  DuplicateEmailError,
  type AccountForLogin,
  type CreateRegistrationInput,
  type PendingProfileProvision,
  type PermanentProvisionCode,
  type RegistrationStore,
  profileProvisionType,
} from "../handle-profile-creation-result.js";
import { prisma } from "./prisma.js";

/** Données de profil sérialisées dans le message durable, indépendantes des identifiants de livraison. */
type ProfilePayload = {
  /** Nom affiché du profil, distinct du username unique. */
  displayName: string;
  /** Nom unique canonique : 3 à 24 caractères a-z, 0-9 ou _. */
  username: string;
};

/** Vérifie les champs du JSON stocké avant de reconstruire une demande ; rejette un message corrompu. */
function parseProfilePayload(value: Prisma.JsonValue): ProfilePayload {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.displayName === "string" &&
    typeof value.username === "string"
  ) {
    return {
      displayName: value.displayName,
      username: value.username,
    };
  }

  throw new Error("invalid profile provision payload in outbox");
}

/**
 * Calcule la prochaine tentative avec un délai exponentiel plafonné à 60 secondes. attempts est le
 * nombre de tentatives déjà comptées.
 */
function nextAttemptAt(attempts: number): Date {
  const delaySeconds = Math.min(60, 2 ** Math.min(attempts, 6));
  return new Date(Date.now() + delaySeconds * 1000);
}

/** Implémente les transactions du compte et de la boîte d’envoi avec le rôle SQL propriétaire d’Auth. */
export class PrismaRegistrationStore implements RegistrationStore {
  /** Exécute SELECT 1 pour vérifier la connexion PostgreSQL. */
  async checkReady(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  }

  /**
   * Crée le compte et son message dans une transaction unique. Transforme le conflit d’unicité Prisma
   * P2002 en DuplicateEmailError.
   */
  async createPendingRegistration(
    input: CreateRegistrationInput,
  ) {
    try {
      return await prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: {
            email: input.email,
            passwordHash: input.passwordHash,
          },
          select: { id: true, email: true },
        });

        const outboxMessage = await tx.outboxMessage.create({
          data: {
            id: randomUUID(),
            type: profileProvisionType,
            aggregateId: account.id,
            aggregateVersion: 1,
            payload: {
              displayName: input.displayName,
              username: input.username,
            },
          },
          select: {
            id: true,
            aggregateId: true,
            aggregateVersion: true,
            payload: true,
            attempts: true,
            createdAt: true,
          },
        });
        const payload = parseProfilePayload(outboxMessage.payload);

        return {
          account,
          message: {
            eventId: outboxMessage.id,
            userId: outboxMessage.aggregateId,
            aggregateVersion: outboxMessage.aggregateVersion,
            occurredAt: outboxMessage.createdAt.toISOString(),
            displayName: payload.displayName,
            username: payload.username,
            attempts: outboxMessage.attempts,
          },
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new DuplicateEmailError();
      }
      throw error;
    }
  }

  /**
   * Lit les champs de connexion et vérifie l’état stocké ; renvoie null si l’email est absent et rejette
   * un état inconnu.
   */
  async findAccountByEmail(email: string): Promise<AccountForLogin | null> {
    const account = await prisma.account.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        state: true,
      },
    });

    if (!account) {
      return null;
    }

    if (
      account.state !== "pending_profile" &&
      account.state !== "active" &&
      account.state !== "profile_failed"
    ) {
      throw new Error(`unsupported account state: ${account.state}`);
    }

    return { ...account, state: account.state };
  }

  /**
   * Lit les demandes pending dont le délai est écoulé, de la plus ancienne à la plus récente, dans la
   * limite demandée.
   */
  async listPendingProvisions(
    limit: number,
  ): Promise<PendingProfileProvision[]> {
    const messages = await prisma.outboxMessage.findMany({
      where: {
        status: "pending",
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        aggregateId: true,
        aggregateVersion: true,
        payload: true,
        attempts: true,
        createdAt: true,
      },
    });

    return messages.map((message) => {
      const payload = parseProfilePayload(message.payload);
      return {
        eventId: message.id,
        userId: message.aggregateId,
        aggregateVersion: message.aggregateVersion,
        occurredAt: message.createdAt.toISOString(),
        displayName: payload.displayName,
        username: payload.username,
        attempts: message.attempts,
      };
    });
  }

  /** Passe le message pending à delivered et le compte pending_profile à active dans la même transaction. */
  async markProvisioned(message: PendingProfileProvision): Promise<void> {
    await prisma.$transaction([
      prisma.outboxMessage.updateMany({
        where: { id: message.eventId, status: "pending" },
        data: {
          status: "delivered",
          deliveredAt: new Date(),
          lastError: null,
        },
      }),
      prisma.account.updateMany({
        where: { id: message.userId, state: "pending_profile" },
        data: { state: "active" },
      }),
    ]);
  }

  /**
   * Reporte uniquement un message encore pending et incrémente son compteur ; une livraison déjà
   * confirmée reste inchangée.
   */
  async markProvisionAttemptFailed(
    message: PendingProfileProvision,
    errorCode: string,
  ): Promise<void> {
    await prisma.outboxMessage.updateMany({
      where: { id: message.eventId, status: "pending" },
      data: {
        attempts: { increment: 1 },
        lastError: errorCode,
        nextAttemptAt: nextAttemptAt(message.attempts + 1),
      },
    });
  }

  /** Marque ensemble le message failed et le compte profile_failed, sans modifier un compte déjà activé. */
  async markProvisionPermanentlyFailed(
    message: PendingProfileProvision,
    errorCode: PermanentProvisionCode,
  ): Promise<void> {
    await prisma.$transaction([
      prisma.outboxMessage.updateMany({
        where: { id: message.eventId, status: "pending" },
        data: {
          status: "failed",
          attempts: { increment: 1 },
          lastError: errorCode,
        },
      }),
      prisma.account.updateMany({
        where: { id: message.userId, state: "pending_profile" },
        data: { state: "profile_failed" },
      }),
    ]);
  }
}
