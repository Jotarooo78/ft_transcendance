import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { randomUUID, timingSafeEqual } from "node:crypto";
import client from "prom-client";

import {
  ProfileConflictError,
  type ProfileProvisionCommand,
  type ProfileProvisioner,
  UsernameTakenError,
  profileProvisionType,
} from "./profile-provisioning.js";

declare module "fastify" {
  interface FastifyRequest {
    authenticatedUserId?: string;
    requestStart: bigint;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub?: unknown; [claim: string]: unknown };
    user: { sub?: unknown; [claim: string]: unknown };
  }
}

export type ProfileDto = {
  userId: string;
  displayName: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
};

export type ProfileReader = (userId: string) => Promise<ProfileDto | null>;

export type ProfileUpdater = (
  userId: string,
  values: Pick<ProfileDto, "displayName" | "username" | "bio">,
) => Promise<ProfileDto>;

export type AvatarWriter = (userId: string, fileName: string, bytes: Buffer) => Promise<ProfileDto>;
export type AvatarReader = (fileName: string) => Promise<Buffer | null>;
export const maxAvatarBytes = 2 * 1024 * 1024;
const avatarTypes = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
const avatarFilePattern = /^[0-9a-f-]{36}-[0-9a-f-]{36}\.(png|jpg|webp)$/i;

export class UsernameConflictError extends Error {
  constructor() {
    super("username already in use");
    this.name = "UsernameConflictError";
  }
}

type BuildAppOptions = {
  internalServiceToken?: string;
  jwtSecret: string;
  logger?: boolean;
  provisionProfile?: ProfileProvisioner;
  readProfile: ProfileReader;
  profileUpdater: ProfileUpdater;
  writeAvatar?: AvatarWriter;
  readAvatar?: AvatarReader;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const usernamePattern = /^[a-z0-9_]{3,24}$/;

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedUsername = value.trim().toLowerCase();
  return usernamePattern.test(normalizedUsername) ? normalizedUsername : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProfileProvisionCommand(
  body: unknown,
): ProfileProvisionCommand | null {
  if (!isRecord(body) || !isRecord(body.data)) {
    return null;
  }

  const displayName = body.data.displayName;
  const username = normalizeUsername(body.data.username);

  if (
    typeof body.eventId !== "string" ||
    !uuidPattern.test(body.eventId) ||
    body.type !== profileProvisionType ||
    body.schemaVersion !== 1 ||
    typeof body.aggregateId !== "string" ||
    !uuidPattern.test(body.aggregateId) ||
    typeof body.aggregateVersion !== "number" ||
    !Number.isInteger(body.aggregateVersion) ||
    body.aggregateVersion < 1 ||
    typeof body.occurredAt !== "string" ||
    Number.isNaN(Date.parse(body.occurredAt)) ||
    typeof displayName !== "string" ||
    displayName !== displayName.trim() ||
    displayName.length < 1 ||
    displayName.length > 60 ||
    username === null
  ) {
    return null;
  }

  return {
    eventId: body.eventId,
    type: profileProvisionType,
    schemaVersion: 1,
    aggregateId: body.aggregateId,
    aggregateVersion: body.aggregateVersion,
    occurredAt: body.occurredAt,
    data: { displayName, username },
  };
}

function hasValidInternalToken(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) {
    return false;
  }

  const received = Buffer.from(authorization.slice(prefix.length));
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function buildApp({
  internalServiceToken,
  jwtSecret,
  logger = true,
  provisionProfile,
  readProfile,
  profileUpdater,
  writeAvatar,
  readAvatar,
}: BuildAppOptions): FastifyInstance {
  if ((writeAvatar === undefined) !== (readAvatar === undefined)) {
    throw new Error("writeAvatar and readAvatar must be configured together");
  }
  if ((internalServiceToken === undefined) !== (provisionProfile === undefined)) {
    throw new Error(
      "internalServiceToken and provisionProfile must be configured together",
    );
  }

  const app = Fastify({ logger });
  const metricsRegistry = new client.Registry();

  client.collectDefaultMetrics({
    prefix: "user_service_",
    register: metricsRegistry,
  });

  const httpRequestDurationSeconds = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["service", "method", "route", "status_code"],
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [metricsRegistry],
  });

  app.register(jwt, { secret: jwtSecret });
  app.register(multipart, { limits: { fileSize: maxAvatarBytes, files: 1 } });
  app.decorateRequest("authenticatedUserId", "");

  app.addHook("onRequest", async (request) => {
    request.requestStart = process.hrtime.bigint();
  });

  app.addHook("onResponse", async (request, reply) => {
    const durationNs = process.hrtime.bigint() - request.requestStart;
    const durationSeconds = Number(durationNs) / 1e9;
    const route = request.routeOptions?.url ?? "unknown";

    httpRequestDurationSeconds
      .labels("user-service", request.method, route, String(reply.statusCode))
      .observe(durationSeconds);
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "user-service",
  }));

  app.get("/ready", async () => ({
    status: "ready",
    service: "user-service",
  }));

  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });

  if (internalServiceToken && provisionProfile) {
    app.put<{ Params: { userId: string }; Body: unknown }>(
      "/internal/profiles/:userId",
      async (request, reply) => {
        if (
          !hasValidInternalToken(
            request.headers.authorization,
            internalServiceToken,
          )
        ) {
          return reply.code(401).send({ error: "unauthorized" });
        }

        const command = parseProfileProvisionCommand(request.body);
        if (!command || command.aggregateId !== request.params.userId) {
          return reply
            .code(400)
            .send({ error: "invalid profile provision command" });
        }

        try {
          const result = await provisionProfile(command);
          return reply
            .code(result.status === "created" ? 201 : 200)
            .send({
              status: result.status,
              userId: command.aggregateId,
            });
        } catch (error) {
          if (error instanceof UsernameTakenError) {
            return reply.code(409).send({
              error: error.message,
              code: "USERNAME_TAKEN",
            });
          }

          if (error instanceof ProfileConflictError) {
            return reply.code(409).send({
              error: error.message,
              code: "PROFILE_CONFLICT",
            });
          }

          throw error;
        }
      },
    );
  }

  async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
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

  app.get(
    "/me",
    { onRequest: authenticate },
    async (request, reply) => {
      const profile = await readProfile(request.authenticatedUserId!);

      if (!profile) {
        return reply.code(404).send({ error: "profile not found" });
      }

      return {
        userId: profile.userId,
        displayName: profile.displayName,
        username: profile.username,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
      } satisfies ProfileDto;
    },
  );

  app.put<{ Body: unknown }>(
    "/me/profile",
    { onRequest: authenticate },
    async (request, reply) => {
      const body = isRecord(request.body) ? request.body : {};
      const displayName =
        typeof body.displayName === "string" ? body.displayName.trim() : "";
      const username = normalizeUsername(body.username);
      const bio = typeof body.bio === "string" ? body.bio.trim() : body.bio;

      if (!displayName || displayName.length > 60) {
        return reply.code(400).send({
          error: "displayName must be between 1 and 60 chars",
        });
      }
      if (username === null) {
        return reply.code(400).send({
          error: "username must match ^[a-z0-9_]{3,24}$",
        });
      }
      if (bio !== null && (typeof bio !== "string" || bio.length > 160)) {
        return reply.code(400).send({
          error: "bio must be null or contain no more than 160 chars",
        });
      }

      try {
        const profile = await profileUpdater(request.authenticatedUserId!, {
          displayName,
          username,
          bio: bio === "" ? null : bio,
        });
        return {
          userId: profile.userId,
          displayName: profile.displayName,
          username: profile.username,
          bio: profile.bio,
          avatarUrl: profile.avatarUrl,
        } satisfies ProfileDto;
      } catch (error) {
        if (error instanceof UsernameConflictError) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  if (writeAvatar && readAvatar) {
    app.post("/me/avatar", { onRequest: authenticate }, async (request, reply) => {
      if (!request.isMultipart()) {
        return reply.code(400).send({ error: "avatar file is required" });
      }
      const file = await request.file();
      if (!file || file.fieldname !== "avatar") {
        return reply.code(400).send({ error: "avatar field is required" });
      }
      const extension = avatarTypes[file.mimetype as keyof typeof avatarTypes];
      if (!extension) {
        return reply.code(415).send({ error: "unsupported avatar mime type" });
      }
      const bytes = await file.toBuffer();
      const userId = request.authenticatedUserId!;
      const fileName = `${userId}-${randomUUID()}.${extension}`;
      const profile = await writeAvatar(userId, fileName, bytes);
      return {
        userId: profile.userId, displayName: profile.displayName,
        username: profile.username, bio: profile.bio, avatarUrl: profile.avatarUrl,
      } satisfies ProfileDto;
    });

    app.get<{ Params: { fileName: string } }>("/avatars/:fileName", async (request, reply) => {
      const fileName = request.params.fileName;
      if (!avatarFilePattern.test(fileName)) {
        return reply.code(400).send({ error: "invalid file name" });
      }
      const bytes = await readAvatar(fileName);
      if (bytes === null) {
        return reply.code(404).send({ error: "avatar not found" });
      }
      const extension = fileName.split(".").pop();
      const contentType = extension === "png" ? "image/png" : extension === "jpg" ? "image/jpeg" : "image/webp";
      return reply.type(contentType).send(bytes);
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
      return reply.code(413).send({ error: "avatar must not exceed 2 MiB" });
    }
    request.log.error({ err: error }, "unhandled error");
    if (!reply.sent) {
      reply.code(500).send({ error: "internal server error" });
    }
  });

  return app;
}
