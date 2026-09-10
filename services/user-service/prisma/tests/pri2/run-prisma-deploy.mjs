import { spawnSync } from "node:child_process";

const testDatabase = process.env.PRI2_TEST_DATABASE;

if (!testDatabase?.startsWith("transcendence_pri2_test_")) {
  throw new Error(
    "PRI2_TEST_DATABASE must name a dedicated transcendence_pri2_test_* database",
  );
}

const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.pathname = `/${testDatabase}`;

const result = spawnSync(
  "/app/node_modules/.bin/prisma",
  ["migrate", "deploy", "--config", "prisma7.config.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl.toString(),
    },
  },
);

process.exit(result.status ?? 1);
