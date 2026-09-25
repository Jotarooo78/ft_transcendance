import multipart from "@fastify/multipart";
import type { FastifyReply, FastifyRequest } from "fastify";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";

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
const defaultAvatarUrl =
  process.env.DEFAULT_AVATAR_URL ?? "/api/users/avatars/default-avatar.png";
const avatarStorageDir = process.env.AVATAR_STORAGE_DIR ?? "/tmp/user-service-avatars";
const maxAvatarBytes = 2 * 1024 * 1024;
const onlineWindowSeconds = 120;
const allowedAvatarMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

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
  }).then((profile) => {
    if (!profile) {
      return null;
    }

    return {
      ...profile,
      avatarUrl: profile.avatarUrl ?? defaultAvatarUrl,
    };
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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.register(multipart, {
  limits: {
    fileSize: maxAvatarBytes,
    files: 1,
  },
});

app.decorateRequest("authenticatedUserId", "");

async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: "unauthorized" });
    return;
  }

  const subject = request.user.sub;
  if (typeof subject !== "string" || !uuidPattern.test(subject)) {
    await reply.code(401).send({ error: "unauthorized" });
    return;
  }

  request.authenticatedUserId = subject;
}

app.get("/profile/:userId", async (request, reply) => {
  const params = request.params as { userId?: string };
  const userId = params.userId;

  if (typeof userId !== "string" || !uuidPattern.test(userId)) {
    return reply.code(400).send({ error: "invalid user id" });
  }

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      userId: true,
      displayName: true,
      username: true,
      avatarUrl: true,
    },
  });

  if (!profile) {
    return reply.code(404).send({ error: "profile not found" });
  }

  return {
    ...profile,
    avatarUrl: profile.avatarUrl ?? defaultAvatarUrl,
  };
});

app.put("/me/profile", { onRequest: authenticate }, async (request, reply) => {
  const userId = request.authenticatedUserId;
  const body = request.body as { displayName?: unknown; username?: unknown };

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const usernameRaw = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";

  if (!userId) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  if (!displayName || displayName.length > 60) {
    return reply.code(400).send({ error: "displayName must be between 1 and 60 chars" });
  }

  if (!/^[a-z0-9_]{3,24}$/.test(usernameRaw)) {
    return reply.code(400).send({ error: "username must match ^[a-z0-9_]{3,24}$" });
  }

  try {
    const profile = await prisma.profile.upsert({
      where: { userId },
      update: {
        displayName,
        username: usernameRaw,
      },
      create: {
        userId,
        displayName,
        username: usernameRaw,
      },
      select: {
        userId: true,
        displayName: true,
        username: true,
        avatarUrl: true,
      },
    });

    return {
      ...profile,
      avatarUrl: profile.avatarUrl ?? defaultAvatarUrl,
    };
  } catch (error: unknown) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return reply.code(409).send({ error: "username already in use" });
    }

    throw error;
  }
});

app.post("/me/avatar", { onRequest: authenticate }, async (request, reply) => {
  const userId = request.authenticatedUserId;

  if (!userId) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  const avatarFile = await request.file();
  if (!avatarFile) {
    return reply.code(400).send({ error: "avatar file is required" });
  }

  if (!allowedAvatarMimeTypes.has(avatarFile.mimetype)) {
    return reply.code(415).send({ error: "unsupported avatar mime type" });
  }

  const extension = avatarFile.mimetype === "image/png"
    ? "png"
    : avatarFile.mimetype === "image/jpeg"
      ? "jpg"
      : "webp";

  const fileName = `${userId}-${randomUUID()}.${extension}`;
  const filePath = join(avatarStorageDir, fileName);
  const fileBuffer = await avatarFile.toBuffer();
  await writeFile(filePath, fileBuffer);

  const avatarUrl = `/api/users/avatars/${fileName}`;

  const profile = await prisma.profile.upsert({
    where: { userId },
    update: { avatarUrl },
    create: {
      userId,
      displayName: "New user",
      username: `user_${userId.slice(0, 8)}`,
      avatarUrl,
    },
    select: {
      userId: true,
      displayName: true,
      username: true,
      avatarUrl: true,
    },
  });

  return {
    ...profile,
    avatarUrl: profile.avatarUrl ?? defaultAvatarUrl,
  };
});

app.get("/avatars/:fileName", async (request, reply) => {
  const params = request.params as { fileName?: string };
  const fileName = params.fileName;

  if (!fileName || basename(fileName) !== fileName) {
    return reply.code(400).send({ error: "invalid file name" });
  }

  const absolutePath = join(avatarStorageDir, fileName);
  const contentType = fileName.endsWith(".png")
    ? "image/png"
    : fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")
      ? "image/jpeg"
      : fileName.endsWith(".webp")
        ? "image/webp"
        : null;

  if (!contentType) {
    return reply.code(404).send({ error: "avatar not found" });
  }

  try {
    const fileBuffer = await readFile(absolutePath);
    reply.header("Content-Type", contentType);
    return reply.send(fileBuffer);
  } catch {
    return reply.code(404).send({ error: "avatar not found" });
  }
});

app.post("/friends/:friendId", { onRequest: authenticate }, async (request, reply) => {
  const userId = request.authenticatedUserId;
  const params = request.params as { friendId?: string };
  const friendId = params.friendId;

  if (!userId) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  if (typeof friendId !== "string" || !uuidPattern.test(friendId)) {
    return reply.code(400).send({ error: "invalid friend id" });
  }

  if (friendId === userId) {
    return reply.code(400).send({ error: "cannot add yourself" });
  }

  const friendProfile = await prisma.profile.findUnique({
    where: { userId: friendId },
    select: { userId: true },
  });

  if (!friendProfile) {
    return reply.code(404).send({ error: "friend profile not found" });
  }

  await prisma.friend.createMany({
    data: [
      { userId, friendId },
      { userId: friendId, friendId: userId },
    ],
    skipDuplicates: true,
  });

  return { ok: true };
});

app.delete("/friends/:friendId", { onRequest: authenticate }, async (request, reply) => {
  const userId = request.authenticatedUserId;
  const params = request.params as { friendId?: string };
  const friendId = params.friendId;

  if (!userId) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  if (typeof friendId !== "string" || !uuidPattern.test(friendId)) {
    return reply.code(400).send({ error: "invalid friend id" });
  }

  await prisma.friend.deleteMany({
    where: {
      OR: [
        { userId, friendId },
        { userId: friendId, friendId: userId },
      ],
    },
  });

  return { ok: true };
});

app.get("/friends", { onRequest: authenticate }, async (request, reply) => {
  const userId = request.authenticatedUserId;

  if (!userId) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  const links = await prisma.friend.findMany({
    where: { userId },
    select: { friendId: true },
  });

  const friendIds = links.map((link) => link.friendId);
  if (friendIds.length === 0) {
    return { friends: [] };
  }

  const [profiles, presences] = await Promise.all([
    prisma.profile.findMany({
      where: { userId: { in: friendIds } },
      select: {
        userId: true,
        displayName: true,
        username: true,
        avatarUrl: true,
      },
    }),
    prisma.presence.findMany({
      where: { userId: { in: friendIds } },
      select: {
        userId: true,
        isOnline: true,
        lastSeenAt: true,
      },
    }),
  ]);

  const nowMs = Date.now();
  const ttlMs = onlineWindowSeconds * 1000;
  const presenceByUserId = new Map(
    presences.map((presence) => [presence.userId, presence]),
  );

  const friends = profiles.map((profile) => {
    const presence = presenceByUserId.get(profile.userId);
    const isOnline =
      !!presence &&
      presence.isOnline &&
      nowMs - presence.lastSeenAt.getTime() <= ttlMs;

    return {
      userId: profile.userId,
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl ?? defaultAvatarUrl,
      onlineStatus: isOnline ? "online" : "offline",
      lastSeenAt: presence?.lastSeenAt.toISOString() ?? null,
    };
  });

  return { friends };
});

app.post("/presence/heartbeat", { onRequest: authenticate }, async (request, reply) => {
  const userId = request.authenticatedUserId;

  if (!userId) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  await prisma.presence.upsert({
    where: { userId },
    update: {
      isOnline: true,
      lastSeenAt: new Date(),
    },
    create: {
      userId,
      isOnline: true,
      lastSeenAt: new Date(),
    },
  });

  return { onlineStatus: "online" };
});

app.post("/presence/offline", { onRequest: authenticate }, async (request, reply) => {
  const userId = request.authenticatedUserId;

  if (!userId) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  await prisma.presence.upsert({
    where: { userId },
    update: {
      isOnline: false,
      lastSeenAt: new Date(),
    },
    create: {
      userId,
      isOnline: false,
      lastSeenAt: new Date(),
    },
  });

  return { onlineStatus: "offline" };
});

app.get("/presence/:userId", async (request, reply) => {
  const params = request.params as { userId?: string };
  const userId = params.userId;

  if (typeof userId !== "string" || !uuidPattern.test(userId)) {
    return reply.code(400).send({ error: "invalid user id" });
  }

  const presence = await prisma.presence.findUnique({
    where: { userId },
    select: {
      isOnline: true,
      lastSeenAt: true,
    },
  });

  const isOnline =
    !!presence &&
    presence.isOnline &&
    Date.now() - presence.lastSeenAt.getTime() <= onlineWindowSeconds * 1000;

  return {
    userId,
    onlineStatus: isOnline ? "online" : "offline",
    lastSeenAt: presence?.lastSeenAt.toISOString() ?? null,
  };
});

app.addHook("onClose", disconnectPrisma);

async function start(): Promise<void> {
  try {
    await mkdir(avatarStorageDir, { recursive: true });
    await app.listen({ port: 4001, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
