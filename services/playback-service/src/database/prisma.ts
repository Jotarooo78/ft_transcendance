import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../generated/prisma/client.js";

if (!process.env.PLAYBACK_DATABASE_URL && !process.env.DATABASE_URL) {
  loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
}

const connectionString = process.env.PLAYBACK_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("PLAYBACK_DATABASE_URL or DATABASE_URL is required at runtime");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
