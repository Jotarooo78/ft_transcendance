/** Client Prisma du schéma propriétaire du service media ; utilise l’URL runtime avec les permissions limitées de ce service. */
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../generated/prisma/client.js";

if (!process.env.MEDIA_DATABASE_URL && !process.env.DATABASE_URL) {
  loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
}

/**
 * URL runtime du service, avec ancien DATABASE_URL en repli ; distincte de l’URL utilisée par les
 * migrations.
 */
const connectionString = process.env.MEDIA_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("MEDIA_DATABASE_URL or DATABASE_URL is required at runtime");
}

/** Adaptateur PostgreSQL reliant le pool de connexions au client Prisma. */
const adapter = new PrismaPg({ connectionString });

/** Client du schéma propriétaire ; ses droits viennent du rôle contenu dans l’URL runtime. */
export const prisma = new PrismaClient({ adapter });

/** Ferme le client Prisma et libère le pool PostgreSQL lors de l’arrêt ou de la fin d’une commande. */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
