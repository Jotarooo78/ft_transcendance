import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

if (!process.env.DATABASE_URL) {
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
    url: env("DATABASE_URL"),
  },
});