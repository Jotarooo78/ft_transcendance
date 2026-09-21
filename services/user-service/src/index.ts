import { buildApp, type ProfileReader } from "./app.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";
import { Prisma } from "./generated/prisma/client.js";
import {
  ProfileConflictError,
  type ProfileProvisioner,
  UsernameTakenError,
} from "./profile-provisioning.js";

const jwtSecret = process.env.JWT_SECRET;
const internalServiceToken = process.env.INTERNAL_SERVICE_TOKEN;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required at runtime");
}

if (!internalServiceToken) {
  throw new Error("INTERNAL_SERVICE_TOKEN is required at runtime");
}

const readProfile: ProfileReader = (userId) =>
  prisma.profile.findUnique({
    where: { userId },
    select: {
      userId: true,
      displayName: true,
      username: true,
      avatarUrl: true,
    },
  });

const provisionProfile: ProfileProvisioner = async (command) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const processedMessage = await tx.inboxMessage.findUnique({
        where: { id: command.eventId },
        select: { id: true },
      });

      if (processedMessage) {
        return { status: "already_processed" } as const;
      }

      await tx.inboxMessage.create({
        data: {
          id: command.eventId,
          type: command.type,
          aggregateId: command.aggregateId,
          aggregateVersion: command.aggregateVersion,
          result: { status: "created" },
        },
      });

      const existingProfile = await tx.profile.findUnique({
        where: { userId: command.aggregateId },
        select: { userId: true },
      });

      if (existingProfile) {
        throw new ProfileConflictError();
      }

      await tx.profile.create({
        data: {
          userId: command.aggregateId,
          displayName: command.data.displayName,
          username: command.data.username,
        },
      });

      return { status: "created" } as const;
    });
  } catch (error) {
    if (error instanceof ProfileConflictError) {
      throw error;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const processedMessage = await prisma.inboxMessage.findUnique({
        where: { id: command.eventId },
        select: { id: true },
      });

      if (processedMessage) {
        return { status: "already_processed" };
      }

      const [profileForUser, profileForUsername] = await Promise.all([
        prisma.profile.findUnique({
          where: { userId: command.aggregateId },
          select: { userId: true },
        }),
        prisma.profile.findUnique({
          where: { username: command.data.username },
          select: { userId: true },
        }),
      ]);

      if (profileForUser) {
        throw new ProfileConflictError();
      }

      if (profileForUsername) {
        throw new UsernameTakenError();
      }
    }

    throw error;
  }
};

const app = buildApp({
  internalServiceToken,
  jwtSecret,
  provisionProfile,
  readProfile,
});

app.addHook("onClose", disconnectPrisma);

async function start(): Promise<void> {
  try {
    await app.listen({ port: 4001, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
