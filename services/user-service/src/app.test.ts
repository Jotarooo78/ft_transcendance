import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildApp, type ProfileDto, type ProfileReader } from "./app.js";

const jwtSecret = "test-only-user-service-secret-with-sufficient-length";

async function createToken(
  readProfile: ProfileReader,
  subject: unknown,
  additionalClaims: Record<string, unknown> = {},
) {
  const app = buildApp({ jwtSecret, logger: false, readProfile });
  await app.ready();
  const token = app.jwt.sign({ ...additionalClaims, sub: subject });

  return { app, token };
}

test("GET /me returns exactly the allowed profile DTO", async () => {
  const userId = randomUUID();
  const storedProfile = {
    userId,
    displayName: "Léa",
    username: "lea",
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    email: "private@example.invalid",
    passwordHash: "must-never-leave-auth",
  };
  const readProfile: ProfileReader = async (requestedUserId) => {
    assert.equal(requestedUserId, userId);
    return storedProfile;
  };
  const { app, token } = await createToken(readProfile, userId);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json<ProfileDto>();
    assert.deepEqual(body, {
      userId,
      displayName: "Léa",
      username: "lea",
      avatarUrl: null,
    });
    assert.deepEqual(Object.keys(body).sort(), [
      "avatarUrl",
      "displayName",
      "userId",
      "username",
    ]);
  } finally {
    await app.close();
  }
});

test("GET /me returns 404 when the authenticated profile does not exist", async () => {
  const userId = randomUUID();
  const { app, token } = await createToken(async () => null, userId);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "profile not found" });
  } finally {
    await app.close();
  }
});

test("GET /me ignores client-controlled identity values", async () => {
  const authenticatedUserId = randomUUID();
  const attackerChosenUserId = randomUUID();
  const requestedIds: string[] = [];
  const readProfile: ProfileReader = async (userId) => {
    requestedIds.push(userId);
    return {
      userId,
      displayName: "Authenticated user",
      username: "authenticated_user",
      avatarUrl: null,
    };
  };
  const { app, token } = await createToken(readProfile, authenticatedUserId, {
    userId: attackerChosenUserId,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: `/me?userId=${attackerChosenUserId}`,
      headers: {
        authorization: `Bearer ${token}`,
        "x-user-id": attackerChosenUserId,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(requestedIds, [authenticatedUserId]);
    assert.equal(response.json<ProfileDto>().userId, authenticatedUserId);
  } finally {
    await app.close();
  }
});

test("GET /me rejects a token without a UUID subject", async () => {
  let readCount = 0;
  const readProfile: ProfileReader = async () => {
    readCount += 1;
    return null;
  };
  const { app, token } = await createToken(readProfile, "client-controlled-id");

  try {
    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "unauthorized" });
    assert.equal(readCount, 0);
  } finally {
    await app.close();
  }
});

test("GET /me rejects a request without a token", async () => {
  let readCount = 0;
  const app = buildApp({
    jwtSecret,
    logger: false,
    readProfile: async () => {
      readCount += 1;
      return null;
    },
  });

  try {
    const response = await app.inject({ method: "GET", url: "/me" });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "unauthorized" });
    assert.equal(readCount, 0);
  } finally {
    await app.close();
  }
});
