import jwt from "@fastify/jwt";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { timingSafeEqual } from "node:crypto";
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
  avatarUrl: string | null;
};

export type ProfileReader = (userId: string) => Promise<ProfileDto | null>;

type BuildAppOptions = {
  internalServiceToken?: string;
  jwtSecret: string;
  logger?: boolean;
  provisionProfile?: ProfileProvisioner;
  readProfile: ProfileReader;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const usernamePattern = /^[a-z0-9_]{3,30}$/;

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
  const username = body.data.username;

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
    displayName.length < 2 ||
    displayName.length > 100 ||
    typeof username !== "string" ||
    !usernamePattern.test(username)
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
}: BuildAppOptions): FastifyInstance {
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
        avatarUrl: profile.avatarUrl,
      } satisfies ProfileDto;
    },
  );

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "unhandled error");
    if (!reply.sent) {
      reply.code(500).send({ error: "internal server error" });
    }
  });

  return app;
}
