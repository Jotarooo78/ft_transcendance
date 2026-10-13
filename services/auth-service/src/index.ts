/** Assemble Auth avec Prisma, le client HTTP Users et la relance périodique des demandes de profil en attente. */
import { buildApp } from "./app.js";
import { PrismaRegistrationStore } from "./database/registration-store.js";
import { disconnectPrisma } from "./database/prisma.js";
import { createHttpProfileProvisioner } from "./request-profile-creation.js";
import { deliverProfileProvision } from "./handle-profile-creation-result.js";

/** Secret serveur pour vérifier ou signer les JWT ; ne doit pas être envoyé au navigateur. */
const jwtSecret = process.env.JWT_SECRET;
/** Secret partagé entre services pour les routes internes ; distinct du JWT utilisateur. */
const internalServiceToken = process.env.INTERNAL_SERVICE_TOKEN;
/** Adresse interne de Users utilisée pour livrer une demande de profil. */
const userServiceUrl =
  process.env.USER_SERVICE_URL ?? "http://user-service:4001";

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required at runtime");
}

if (!internalServiceToken) {
  throw new Error("INTERNAL_SERVICE_TOKEN is required at runtime");
}

/** Stockage du compte et de sa demande durable de création de profil. */
const registrationStore = new PrismaRegistrationStore();
/** Opération de livraison de la demande de profil à Users. */
const profileProvisioner = createHttpProfileProvisioner({
  internalServiceToken,
  userServiceUrl,
});
/**
 * Application HTTP assemblée avec ses lecteurs et écrivains ; l’ouverture du port est effectuée
 * séparément.
 */
const app = buildApp({
  jwtSecret,
  profileProvisioner,
  registrationStore,
});

/** Garde locale empêchant deux lots de livraison de profils de tourner simultanément. */
let workerRunning = false;

/**
 * Traite les demandes prêtes à être relivrées sans exécuter deux lots simultanément dans cette
 * instance. Les erreurs sont journalisées pour la prochaine passe.
 */
async function deliverPendingProfiles(): Promise<void> {
  if (workerRunning) {
    return;
  }

  workerRunning = true;
  try {
    const messages = await registrationStore.listPendingProvisions(20);
    for (const message of messages) {
      const result = await deliverProfileProvision(
        registrationStore,
        profileProvisioner,
        message,
      );

      if (result.status === "pending") {
        app.log.warn(
          { eventId: message.eventId, userId: message.userId },
          "profile provision will be retried",
        );
      }
    }
  } catch (error) {
    app.log.error({ err: error }, "profile provision worker failed");
  } finally {
    workerRunning = false;
  }
}

/**
 * Timer de relance des demandes de profil toutes les deux secondes ; une erreur ne supprime pas la
 * demande durable.
 */
const worker = setInterval(() => {
  void deliverPendingProfiles();
}, 2000);

app.addHook("onClose", async () => {
  clearInterval(worker);
  await disconnectPrisma();
});

/**
 * Démarre le serveur sur son port configuré ; journalise l’échec et termine le processus si l’écoute
 * ne peut pas être ouverte.
 */
async function start(): Promise<void> {
  try {
    await app.listen({ port: 4000, host: "0.0.0.0" });
    void deliverPendingProfiles();
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
