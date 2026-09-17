import { buildApp, type ProfileReader } from "./app.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required at runtime");
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
  });

const app = buildApp({ jwtSecret, readProfile });

app.addHook("onClose", disconnectPrisma);

async function start(): Promise<void> {
  try {
    await app.listen({ port: 4001, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
