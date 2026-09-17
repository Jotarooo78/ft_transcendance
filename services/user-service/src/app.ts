import jwt from "@fastify/jwt";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import client from "prom-client";

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
  jwtSecret: string;
  logger?: boolean;
  readProfile: ProfileReader;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildApp({
  jwtSecret,
  logger = true,
  readProfile,
}: BuildAppOptions): FastifyInstance {
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
