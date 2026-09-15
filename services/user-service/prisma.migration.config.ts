import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

if (!process.env.USER_MIGRATION_DATABASE_URL) {
  loadEnv({
    path: fileURLToPath(new URL("../../.env", import.meta.url)),
  });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("USER_MIGRATION_DATABASE_URL"),
  },
});
