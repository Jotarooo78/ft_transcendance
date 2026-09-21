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
} from "../provisioning.js";
import { prisma } from "./prisma.js";

type ProfilePayload = {
  displayName: string;
  username: string;
};

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

function nextAttemptAt(attempts: number): Date {
  const delaySeconds = Math.min(60, 2 ** Math.min(attempts, 6));
  return new Date(Date.now() + delaySeconds * 1000);
}

export class PrismaRegistrationStore implements RegistrationStore {
  async checkReady(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  }

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
