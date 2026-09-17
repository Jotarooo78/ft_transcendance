import argon2 from "argon2";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import client from "prom-client";

import { disconnectPrisma, prisma } from "./database/prisma.js";
import { Prisma } from "./generated/prisma/client.js";

declare module "fastify" {
  interface FastifyRequest {
    requestStart: bigint;
  }
}

type SignUpBody = {
  email?: unknown;
  password?: unknown;
};

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required at runtime");
}

const app = Fastify({ logger: true });
client.collectDefaultMetrics({ prefix: "auth_service_" });

const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["service", "method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});

app.register(jwt, { secret: jwtSecret });
app.register(rateLimit, {
  global: false,
  max: 120,
  timeWindow: "1 minute",
});

app.addHook("onRequest", async (req) => {
  req.requestStart = process.hrtime.bigint();
});

app.addHook("onResponse", async (req, reply) => {
  const durationNs = process.hrtime.bigint() - req.requestStart;
  const durationSeconds = Number(durationNs) / 1e9;
  const route = req.routeOptions?.url ?? "unknown";

  httpRequestDurationSeconds
    .labels("auth-service", req.method, route, String(reply.statusCode))
    .observe(durationSeconds);
});

app.addHook("onClose", disconnectPrisma);

app.get("/health", async () => ({ status: "ok", service: "auth-service" }));

app.get("/ready", async (_req, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ready", service: "auth-service" };
  } catch {
    reply.code(503);
    return { status: "not-ready", service: "auth-service" };
  }
});

app.get("/metrics", async (_req, reply) => {
  reply.header("Content-Type", client.register.contentType);
  return client.register.metrics();
});

app.post<{ Body: SignUpBody }>(
  "/signup",
  {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "1 minute",
      },
    },
  },
  async (req, reply) => {
    const normalizedEmail =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    if (!normalizedEmail || password.length < 8) {
      return reply.code(400).send({
        error: "email and password (min 8 chars) required",
      });
    }

    const passwordHash = await argon2.hash(password);

    try {
      const account = await prisma.account.create({
        data: {
          email: normalizedEmail,
          passwordHash,
        },
        select: {
          id: true,
          email: true,
        },
      });

      return reply.code(201).send(account);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return reply.code(409).send({ error: "email already registered" });
      }

      throw error;
    }
  },
);

app.post<{ Body: LoginBody }>(
  "/login",
  {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: "1 minute",
      },
    },
  },
  async (req, reply) => {
    const normalizedEmail =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    if (!normalizedEmail || !password) {
      return reply
        .code(400)
        .send({ error: "email and password required" });
    }

    const account = await prisma.account.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!account) {
      return reply.code(401).send({ error: "invalid credentials" });
    }

    const valid = await argon2.verify(account.passwordHash, password);
    if (!valid) {
      return reply.code(401).send({ error: "invalid credentials" });
    }

    const token = app.jwt.sign(
      { sub: account.id, email: normalizedEmail },
      { expiresIn: "1h" },
    );
    return { token };
  },
);

app.post("/verify", async (req, reply) => {
  try {
    await req.jwtVerify();
    return { valid: true, user: req.user };
  } catch {
    reply.code(401);
    return { valid: false };
  }
});

app.setErrorHandler((err, req, reply) => {
  req.log.error({ err }, "unhandled error");
  if (!reply.sent) {
    reply.code(500).send({ error: "internal server error" });
  }
});

const start = async () => {
  try {
    await app.listen({ port: 4000, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
