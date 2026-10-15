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
} from "./profile-creation-definitions.js";

declare module "fastify" {
  /** Champs ajoutés à Fastify pour mesurer la requête et porter l’identité vérifiée du compte. */
  interface FastifyRequest {
    /** UUID provenant du JWT vérifié, jamais du corps fourni par le client. */
    authenticatedUserId?: string;
    /** Repère haute résolution du début de requête, utilisé pour mesurer sa durée. */
    requestStart: bigint;
  }
}

declare module "@fastify/jwt" {
  /** Forme du JWT attendu par les routes privées : sub porte l’identité du compte. */
  interface FastifyJWT {
    /** Données du jeton ou du message, à valider avant leur utilisation. */
    payload: {
      /** Sujet du JWT : UUID du compte, vérifié avant de servir des données privées. */
      sub?: unknown; [claim: string]: unknown };
    /** Informations du JWT décodées et signature vérifiée par le plugin Fastify. */
    user: {
      /** Sujet du JWT : UUID du compte, vérifié avant de servir des données privées. */
      sub?: unknown; [claim: string]: unknown };
  }
}

/**
 * Profil renvoyé au client ; bio est nullable et avatarUrl peut être absent, sans exposer les données
 * de connexion.
 */
export type ProfileDto = {
  /** UUID du compte auquel le profil ou la demande est rattaché. */
  userId: string;
  /** Nom affiché du profil, distinct du username unique. */
  displayName: string;
  /** Nom unique canonique : 3 à 24 caractères a-z, 0-9 ou _. */
  username: string;
  /** Présentation facultative, au plus 160 caractères ; null représente son absence. */
  bio: string | null;
  /** URL publique de l’avatar ; absence conservée pour permettre l’avatar par défaut. */
  avatarUrl: string | null;
};

/** Lit le profil d’un compte par UUID ; renvoie null lorsqu’il n’existe pas. */
export type ProfileReader = (userId: string) => Promise<ProfileDto | null>;

/**
 * Enregistre les champs de profil validés pour le compte ; renvoie le profil confirmé et signale les
 * conflits de username.
 */
export type ProfileUpdater = (
  userId: string,
  values: Pick<ProfileDto, "displayName" | "username" | "bio">,
) => Promise<ProfileDto>;

/** Enregistre les octets de l’avatar et associe son nom au profil avant de confirmer le résultat. */
export type AvatarWriter = (userId: string, fileName: string, bytes: Buffer) => Promise<ProfileDto>;
/** Lit les octets de l’avatar demandé ; renvoie null si le fichier est absent. */
export type AvatarReader = (fileName: string) => Promise<Buffer | null>;
/** Limite d’avatar de 2 MiB, soit 2 097 152 octets ; distincte de la gestion générale des images Media. */
export const maxAvatarBytes = 2 * 1024 * 1024;
/** Correspondance des trois MIME d’avatar avec leur extension de stockage. */
const avatarTypes = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
type AvatarMimeType = keyof typeof avatarTypes;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/**
 * Accepte un nom d’avatar formé de l’UUID du compte et d’un UUID de fichier, avec extension image
 * autorisée.
 */
const avatarFilePattern = /^[0-9a-f-]{36}-[0-9a-f-]{36}\.(png|jpg|webp)$/i;

function isAvatarMimeType(value: string): value is AvatarMimeType {
  return Object.prototype.hasOwnProperty.call(avatarTypes, value);
}

function detectAvatarMimeType(bytes: Buffer): AvatarMimeType | null {
  if (
    bytes.length >= pngSignature.length &&
    bytes.subarray(0, pngSignature.length).equals(pngSignature)
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

/** Traduit un username déjà utilisé en conflit HTTP lors de la modification du profil. */
export class UsernameConflictError extends Error {
  /** Initialise le conflit métier de username, sans accès au stockage. */
  constructor() {
    super("username already in use");
    this.name = "UsernameConflictError";
  }
}

/**
 * Opérations de profil injectables. Lecture et écriture d’avatar doivent être configurées ensemble,
 * comme le token interne et la création de profil.
 */
type BuildAppOptions = {
  /** Secret partagé entre services pour les routes internes ; distinct du JWT utilisateur. */
  internalServiceToken?: string;
  /** Secret serveur pour vérifier ou signer les JWT ; ne doit pas être envoyé au navigateur. */
  jwtSecret: string;
  /** Active ou désactive les journaux du serveur construit. */
  logger?: boolean;
  /** Création transactionnelle du profil avec mémoire des événements déjà traités. */
  provisionProfile?: ProfileProvisioner;
  /** Lecture du profil par UUID du compte. */
  readProfile: ProfileReader;
  /** Écriture des champs de profil validés pour le compte. */
  profileUpdater: ProfileUpdater;
  /** Écriture de l’avatar et de sa référence dans le profil. */
  writeAvatar?: AvatarWriter;
  /** Lecture des octets d’un avatar par son nom contrôlé. */
  readAvatar?: AvatarReader;
};

/** Reconnaît le format UUID accepté par ce contrat avant les lectures ou écritures. */
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const usernamePattern = /^[a-z0-9_]{3,24}$/;

/**
 * Normalise le username selon le contrat commun a-z, 0-9 et _, de 3 à 24 caractères ; renvoie null en
 * cas de refus.
 */
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedUsername = value.trim().toLowerCase();
  return usernamePattern.test(normalizedUsername) ? normalizedUsername : null;
}

/** Accepte uniquement un objet non null qui n’est pas un tableau avant d’inspecter une entrée inconnue. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Valide identité, version, date et champs d’une commande Auth ; renvoie une commande normalisée ou
 * null sans écrire en base.
 */
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

/**
 * Compare le token Bearer au secret interne avec une comparaison à durée constante lorsque les
 * longueurs sont identiques.
 */
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

/**
 * Assemble les routes de profil avec leurs dépendances injectées pour les tests. Vérifie les couples
 * d’options, le JWT et les champs avant les écritures ; retourne l’application sans ouvrir de port.
 */
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
    app.put<{
      /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
      Params: {
      /** UUID du compte auquel le profil ou la demande est rattaché. */
      userId: string };
      /** Corps HTTP typé pour cette route ; la validation réelle reste effectuée à l’exécution. */
      Body: unknown }>(
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

  /**
   * Vérifie le JWT et son sujet UUID avant de renseigner authenticatedUserId ; répond 401 si le jeton ou
   * le sujet est invalide.
   */
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

  app.put<{
    /** Corps HTTP typé pour cette route ; la validation réelle reste effectuée à l’exécution. */
    Body: unknown }>(
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
      if (!isAvatarMimeType(file.mimetype)) {
        return reply.code(415).send({ error: "unsupported avatar mime type" });
      }
      const bytes = await file.toBuffer();
      const detectedMimeType = detectAvatarMimeType(bytes);
      if (detectedMimeType !== file.mimetype) {
        return reply.code(415).send({
          error: "avatar content does not match its declared mime type",
        });
      }
      const extension = avatarTypes[detectedMimeType];
      const userId = request.authenticatedUserId!;
      const fileName = `${userId}-${randomUUID()}.${extension}`;
      const profile = await writeAvatar(userId, fileName, bytes);
      return {
        userId: profile.userId, displayName: profile.displayName,
        username: profile.username, bio: profile.bio, avatarUrl: profile.avatarUrl,
      } satisfies ProfileDto;
    });

    app.get<{
      /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
      Params: {
      /** Nom du fichier d’avatar, validé avant toute lecture du stockage. */
      fileName: string } }>("/avatars/:fileName", async (request, reply) => {
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

  /** Profil public minimal de l’artiste ; aucune donnée de connexion ni présence n’est exposée. */
  app.get<{ Params: { id: string } }>("/profiles/:id", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!uuidPattern.test(request.params.id)) return reply.code(400).send({ error: "invalid_request" });
    const profile = await readProfile(request.params.id.toLowerCase());
    if (!profile) return reply.code(404).send({ error: "profile_not_found" });
    return { userId: profile.userId, displayName: profile.displayName, username: profile.username, avatarUrl: profile.avatarUrl, bio: profile.bio };
  });

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
