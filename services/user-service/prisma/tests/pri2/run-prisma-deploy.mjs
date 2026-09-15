import { spawnSync } from "node:child_process";

const testDatabase = process.env.PRI2_TEST_DATABASE;

if (!testDatabase?.startsWith("transcendence_pri2_test_")) {
  throw new Error(
    "PRI2_TEST_DATABASE must name a dedicated transcendence_pri2_test_* database",
  );
}

const sourceDatabaseUrl =
  process.env.USER_MIGRATION_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!sourceDatabaseUrl) {
  throw new Error("A migration database URL is required");
}

const databaseUrl = new URL(sourceDatabaseUrl);
databaseUrl.pathname = `/${testDatabase}`;

const result = spawnSync(
  "/app/node_modules/.bin/prisma",
  ["migrate", "deploy", "--config", "prisma.migration.config.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      USER_MIGRATION_DATABASE_URL: databaseUrl.toString(),
    },
  },
);

process.exit(result.status ?? 1);
