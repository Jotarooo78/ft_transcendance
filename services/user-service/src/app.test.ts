import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildApp, type ProfileDto, type ProfileReader } from "./app.js";
import {
  type ProfileProvisionCommand,
  UsernameTakenError,
  profileProvisionType,
} from "./profile-provisioning.js";

const jwtSecret = "test-only-user-service-secret-with-sufficient-length";
const internalServiceToken =
  "test-only-internal-service-token-with-sufficient-length";

function createProvisionCommand(userId = randomUUID()): ProfileProvisionCommand {
  return {
    eventId: randomUUID(),
    type: profileProvisionType,
    schemaVersion: 1,
    aggregateId: userId,
    aggregateVersion: 1,
    occurredAt: new Date().toISOString(),
    data: {
      displayName: "Léa",
      username: "lea",
    },
  };
}

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

test("PUT /internal/profiles creates a profile and accepts an idempotent replay", async () => {
  const processedEvents = new Set<string>();
  const receivedCommands: ProfileProvisionCommand[] = [];
  const app = buildApp({
    internalServiceToken,
    jwtSecret,
    logger: false,
    provisionProfile: async (command) => {
      receivedCommands.push(command);
      if (processedEvents.has(command.eventId)) {
        return { status: "already_processed" };
      }
      processedEvents.add(command.eventId);
      return { status: "created" };
    },
    readProfile: async () => null,
  });
  const command = createProvisionCommand();

  try {
    const firstResponse = await app.inject({
      method: "PUT",
      url: `/internal/profiles/${command.aggregateId}`,
      headers: { authorization: `Bearer ${internalServiceToken}` },
      payload: command,
    });
    const replayResponse = await app.inject({
      method: "PUT",
      url: `/internal/profiles/${command.aggregateId}`,
      headers: { authorization: `Bearer ${internalServiceToken}` },
      payload: command,
    });

    assert.equal(firstResponse.statusCode, 201);
    assert.deepEqual(firstResponse.json(), {
      status: "created",
      userId: command.aggregateId,
    });
    assert.equal(replayResponse.statusCode, 200);
    assert.deepEqual(replayResponse.json(), {
      status: "already_processed",
      userId: command.aggregateId,
    });
    assert.equal(receivedCommands.length, 2);
  } finally {
    await app.close();
  }
});

test("PUT /internal/profiles rejects a request without the internal credential", async () => {
  let provisionCount = 0;
  const app = buildApp({
    internalServiceToken,
    jwtSecret,
    logger: false,
    provisionProfile: async () => {
      provisionCount += 1;
      return { status: "created" };
    },
    readProfile: async () => null,
  });
  const command = createProvisionCommand();

  try {
    const response = await app.inject({
      method: "PUT",
      url: `/internal/profiles/${command.aggregateId}`,
      payload: command,
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "unauthorized" });
    assert.equal(provisionCount, 0);
  } finally {
    await app.close();
  }
});

test("PUT /internal/profiles exposes a username conflict without retrying it", async () => {
  const app = buildApp({
    internalServiceToken,
    jwtSecret,
    logger: false,
    provisionProfile: async () => {
      throw new UsernameTakenError();
    },
    readProfile: async () => null,
  });
  const command = createProvisionCommand();

  try {
    const response = await app.inject({
      method: "PUT",
      url: `/internal/profiles/${command.aggregateId}`,
      headers: { authorization: `Bearer ${internalServiceToken}` },
      payload: command,
    });

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), {
      error: "username already registered",
      code: "USERNAME_TAKEN",
    });
  } finally {
    await app.close();
  }
});
