/** Configuration des commandes Prisma : cible le schéma et les migrations du service avec l’URL de migration, distincte du rôle runtime. Le chargement de cette configuration n’applique aucune migration. */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

if (!process.env.MEDIA_MIGRATION_DATABASE_URL) {
  loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("MEDIA_MIGRATION_DATABASE_URL") },
});
