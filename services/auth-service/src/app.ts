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
} from "./handle-profile-creation-result.js";

declare module "fastify" {
  /** Ajoute à Fastify le repère temporel servant à mesurer la durée de chaque requête. */
  interface FastifyRequest {
    /** Repère haute résolution du début de requête, utilisé pour mesurer sa durée. */
    requestStart: bigint;
  }
}

/** Entrées de l’inscription, contrôlées par la route avant le hachage et la création du compte. */
type SignUpBody = {
  /** Nom affiché du profil, distinct du username unique. */
  displayName?: unknown;
  /** Adresse utilisée pour identifier le compte à la connexion. */
  email?: unknown;
  /** Mot de passe reçu à valider et hacher ; ne doit pas être renvoyé ni journalisé. */
  password?: unknown;
  /** Nom unique canonique : 3 à 24 caractères a-z, 0-9 ou _. */
  username?: unknown;
};

/** Email et mot de passe transmis pour vérifier la connexion ; ne sont pas renvoyés dans la réponse. */
type LoginBody = {
  /** Adresse utilisée pour identifier le compte à la connexion. */
  email?: unknown;
  /** Mot de passe reçu à valider et hacher ; ne doit pas être renvoyé ni journalisé. */
  password?: unknown;
};

/**
 * Dépendances du serveur Auth : stockage, livraison de profil, hachage, vérification du mot de passe
 * et signature JWT.
 */
type BuildAppOptions = {
  /** Secret serveur pour vérifier ou signer les JWT ; ne doit pas être envoyé au navigateur. */
  jwtSecret: string;
  /** Active ou désactive les journaux du serveur construit. */
  logger?: boolean;
  /** Fonction injectable de calcul de l’empreinte du mot de passe. */
  passwordHasher?: (password: string) => Promise<string>;
  /** Fonction injectable vérifiant le mot de passe contre son empreinte. */
  passwordVerifier?: (hash: string, password: string) => Promise<boolean>;
  /** Opération de livraison de la demande de profil à Users. */
  profileProvisioner: ProfileProvisioner;
  /** Stockage du compte et de sa demande durable de création de profil. */
  registrationStore: RegistrationStore;
};

/** Contrôle syntaxique élémentaire de l’email ; ne prouve pas l’existence de la boîte mail. */
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9_]{3,24}$/;

/**
 * Supprime les espaces extérieurs, passe en minuscules et accepte seulement 3 à 24 caractères a-z, 0-9
 * ou _. Renvoie null si la valeur est invalide.
 */
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedUsername = value.trim().toLowerCase();
  return usernamePattern.test(normalizedUsername) ? normalizedUsername : null;
}

/**
 * Construit les routes et les métriques sans ouvrir de port. L’inscription crée une demande durable ;
 * la connexion exige un profil confirmé avant de signer un JWT.
 */
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

  app.post<{
    /** Corps HTTP typé pour cette route ; la validation réelle reste effectuée à l’exécution. */
    Body: SignUpBody }>(
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
      const username = normalizeUsername(request.body.username);
      const displayName =
        typeof request.body.displayName === "string"
          ? request.body.displayName.trim()
          : "";

      if (
        !emailPattern.test(normalizedEmail) ||
        normalizedEmail.length > 254 ||
        password.length < 8 ||
        password.length > 128 ||
        username === null ||
        displayName.length < 1 ||
        displayName.length > 60
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

  app.post<{
    /** Corps HTTP typé pour cette route ; la validation réelle reste effectuée à l’exécution. */
    Body: LoginBody }>(
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
