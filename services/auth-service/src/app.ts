import argon2 from "argon2";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import client from "prom-client";

import {
  DuplicateEmailError,
  type ProfileProvisioner,
  type RegistrationStore,
  deliverProfileProvision,
} from "./provisioning.js";

declare module "fastify" {
  interface FastifyRequest {
    requestStart: bigint;
  }
}

type SignUpBody = {
  displayName?: unknown;
  email?: unknown;
  password?: unknown;
  username?: unknown;
};

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

type BuildAppOptions = {
  jwtSecret: string;
  logger?: boolean;
  passwordHasher?: (password: string) => Promise<string>;
  passwordVerifier?: (hash: string, password: string) => Promise<boolean>;
  profileProvisioner: ProfileProvisioner;
  registrationStore: RegistrationStore;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9_]{3,30}$/;

export function buildApp({
  jwtSecret,
  logger = true,
  passwordHasher = argon2.hash,
  passwordVerifier = argon2.verify,
  profileProvisioner,
  registrationStore,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger });
  const metricsRegistry = new client.Registry();

  client.collectDefaultMetrics({
    prefix: "auth_service_",
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
  app.register(rateLimit, {
    global: false,
    max: 120,
    timeWindow: "1 minute",
  });

  app.addHook("onRequest", async (request) => {
    request.requestStart = process.hrtime.bigint();
  });

  app.addHook("onResponse", async (request, reply) => {
    const durationNs = process.hrtime.bigint() - request.requestStart;
    const route = request.routeOptions?.url ?? "unknown";

    httpRequestDurationSeconds
      .labels(
        "auth-service",
        request.method,
        route,
        String(reply.statusCode),
      )
      .observe(Number(durationNs) / 1e9);
  });

  app.get("/health", async () => ({ status: "ok", service: "auth-service" }));

  app.get("/ready", async (_request, reply) => {
    try {
      await registrationStore.checkReady();
      return { status: "ready", service: "auth-service" };
    } catch {
      return reply
        .code(503)
        .send({ status: "not-ready", service: "auth-service" });
    }
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", metricsRegistry.contentType);
    return metricsRegistry.metrics();
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
    async (request, reply) => {
      const normalizedEmail =
        typeof request.body.email === "string"
          ? request.body.email.trim().toLowerCase()
          : "";
      const password =
        typeof request.body.password === "string" ? request.body.password : "";
      const username =
        typeof request.body.username === "string"
          ? request.body.username.trim().toLowerCase()
          : "";
      const displayName =
        typeof request.body.displayName === "string"
          ? request.body.displayName.trim()
          : "";

      if (
        !emailPattern.test(normalizedEmail) ||
        normalizedEmail.length > 254 ||
        password.length < 8 ||
        password.length > 128 ||
        !usernamePattern.test(username) ||
        displayName.length < 2 ||
        displayName.length > 100
      ) {
        return reply.code(400).send({
          error:
            "valid email, password (8-128 chars), username and displayName required",
        });
      }

      const passwordHash = await passwordHasher(password);

      try {
        const registration =
          await registrationStore.createPendingRegistration({
            email: normalizedEmail,
            passwordHash,
            username,
            displayName,
          });
        const delivery = await deliverProfileProvision(
          registrationStore,
          profileProvisioner,
          registration.message,
        );

        if (delivery.status === "delivered") {
          return reply.code(201).send({
            status: "registered",
            userId: registration.account.id,
            nextAction: "login",
          });
        }

        if (delivery.status === "permanent_failure") {
          return reply.code(409).send({
            error:
              delivery.code === "USERNAME_TAKEN"
                ? "username already registered"
                : "profile conflicts with an existing registration",
            code: delivery.code,
          });
        }

        return reply.code(202).send({
          status: "pending",
          code: "REGISTRATION_PENDING",
          retryAfterSeconds: 3,
          nextAction: "login",
        });
      } catch (error) {
        if (error instanceof DuplicateEmailError) {
          return reply.code(409).send({
            error: error.message,
            code: "ACCOUNT_ALREADY_EXISTS",
          });
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
    async (request, reply) => {
      const normalizedEmail =
        typeof request.body.email === "string"
          ? request.body.email.trim().toLowerCase()
          : "";
      const password =
        typeof request.body.password === "string" ? request.body.password : "";

      if (!normalizedEmail || !password) {
        return reply
          .code(400)
          .send({ error: "email and password required" });
      }

      const account =
        await registrationStore.findAccountByEmail(normalizedEmail);
      if (
        !account ||
        !(await passwordVerifier(account.passwordHash, password))
      ) {
        return reply.code(401).send({ error: "invalid credentials" });
      }

      if (account.state === "pending_profile") {
        return reply.code(202).send({
          status: "pending",
          code: "REGISTRATION_PENDING",
          retryAfterSeconds: 3,
        });
      }

      if (account.state === "profile_failed") {
        return reply.code(409).send({
          error: "profile provisioning failed",
          code: "REGISTRATION_FAILED",
        });
      }

      const token = app.jwt.sign(
        { sub: account.id, email: account.email },
        { expiresIn: "1h" },
      );
      return { token };
    },
  );

  app.post("/verify", async (request, reply) => {
    try {
      await request.jwtVerify();
      return { valid: true, user: request.user };
    } catch {
      return reply.code(401).send({ valid: false });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "unhandled error");
    if (!reply.sent) {
      reply.code(500).send({ error: "internal server error" });
    }
  });

  return app;
}
