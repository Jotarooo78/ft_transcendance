import { buildApp } from "./app.js";
import { PrismaRegistrationStore } from "./database/registration-store.js";
import { disconnectPrisma } from "./database/prisma.js";
import { createHttpProfileProvisioner } from "./http-profile-provisioner.js";
import { deliverProfileProvision } from "./provisioning.js";

const jwtSecret = process.env.JWT_SECRET;
const internalServiceToken = process.env.INTERNAL_SERVICE_TOKEN;
const userServiceUrl =
  process.env.USER_SERVICE_URL ?? "http://user-service:4001";

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required at runtime");
}

if (!internalServiceToken) {
  throw new Error("INTERNAL_SERVICE_TOKEN is required at runtime");
}

const registrationStore = new PrismaRegistrationStore();
const profileProvisioner = createHttpProfileProvisioner({
  internalServiceToken,
  userServiceUrl,
});
const app = buildApp({
  jwtSecret,
  profileProvisioner,
  registrationStore,
});

let workerRunning = false;

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

const worker = setInterval(() => {
  void deliverPendingProfiles();
}, 2000);

app.addHook("onClose", async () => {
  clearInterval(worker);
  await disconnectPrisma();
});

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
