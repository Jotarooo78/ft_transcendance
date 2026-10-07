import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  buildApp,
  normalizeUsername,
  type ProfileDto,
  type ProfileReader,
  type ProfileUpdater,
  UsernameConflictError,
  maxAvatarBytes,
} from "./app.js";
import {
  type ProfileProvisionCommand,
  UsernameTakenError,
  profileProvisionType,
} from "./profile-provisioning.js";

const jwtSecret = "test-only-user-service-secret-with-sufficient-length";
const internalServiceToken =
  "test-only-internal-service-token-with-sufficient-length";

const unexpectedProfileUpdate: ProfileUpdater = async () => {
  assert.fail("profile updater must not be called");
};

function createProvisionCommand(
  userId = randomUUID(),
  username = "lea",
): ProfileProvisionCommand {
  return {
    eventId: randomUUID(),
    type: profileProvisionType,
    schemaVersion: 1,
    aggregateId: userId,
    aggregateVersion: 1,
    occurredAt: new Date().toISOString(),
    data: {
      displayName: "Léa",
      username,
    },
  };
}

test("username normalization implements the canonical contract", () => {
  assert.equal(normalizeUsername(" Alice "), "alice");
  assert.equal(normalizeUsername("ALICE_2"), "alice_2");
  assert.equal(normalizeUsername("ab"), null);
  assert.equal(normalizeUsername("alice-2"), null);
  assert.equal(normalizeUsername(null), null);
});

async function createToken(
  readProfile: ProfileReader,
  subject: unknown,
  additionalClaims: Record<string, unknown> = {},
  profileUpdater: ProfileUpdater = unexpectedProfileUpdate,
) {
  const app = buildApp({ jwtSecret, logger: false, readProfile, profileUpdater });
  await app.ready();
  const token = app.jwt.sign({ ...additionalClaims, sub: subject });

  return { app, token };
}

test("PUT /me/profile returns exactly the DTO confirmed by the updater", async () => {
  const userId = randomUUID();
  const payload = { displayName: "Léa", username: "lea", bio: null };
  const confirmedProfile = {
    userId,
    displayName: "Confirmed name",
    username: "confirmed_username",
    bio: "Confirmed bio",
    avatarUrl: "/avatars/existing.png",
  };
  const calls: unknown[] = [];
  const { app, token } = await createToken(async () => null, userId, {},
    async (id, values) => {
      calls.push({ id, values });
      return { ...confirmedProfile, email: "private@example.invalid", createdAt: "private" };
    },
  );
  try {
    const response = await app.inject({
      method: "PUT", url: "/me/profile",
      headers: { authorization: `Bearer ${token}` }, payload,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), confirmedProfile);
    assert.deepEqual(calls, [{ id: userId, values: payload }]);
  } finally {
    await app.close();
  }
});

for (const [label, payload, expected] of [
  ["normalization", { displayName: " Léa ", username: " LEA_2 ", bio: " Hello " },
    { displayName: "Léa", username: "lea_2", bio: "Hello" }],
  ["empty bio", { displayName: "Léa", username: "lea", bio: "   " },
    { displayName: "Léa", username: "lea", bio: null }],
  ["maximum lengths", { displayName: "a".repeat(60), username: "a".repeat(24), bio: "b".repeat(160) },
    { displayName: "a".repeat(60), username: "a".repeat(24), bio: "b".repeat(160) }],
] as const) {
  test(`PUT /me/profile accepts ${label}`, async () => {
    const userId = randomUUID();
    const calls: unknown[] = [];
    const { app, token } = await createToken(async () => null, userId, {},
      async (id, values) => {
        calls.push({ id, values });
        return { userId: id, ...values, avatarUrl: null };
      },
    );
    try {
      const response = await app.inject({
        method: "PUT", url: "/me/profile",
        headers: { authorization: `Bearer ${token}` }, payload,
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(calls, [{ id: userId, values: expected }]);
      assert.deepEqual(response.json(), { userId, ...expected, avatarUrl: null });
    } finally {
      await app.close();
    }
  });
}

const validUpdate = { displayName: "Léa", username: "lea", bio: null };
const invalidUpdates = [
  ["empty display name", { ...validUpdate, displayName: " " }, "displayName must be between 1 and 60 chars"],
  ["long display name", { ...validUpdate, displayName: "a".repeat(61) }, "displayName must be between 1 and 60 chars"],
  ["non-string display name", { ...validUpdate, displayName: 42 }, "displayName must be between 1 and 60 chars"],
  ["short username", { ...validUpdate, username: "ab" }, "username must match ^[a-z0-9_]{3,24}$"],
  ["long username", { ...validUpdate, username: "a".repeat(25) }, "username must match ^[a-z0-9_]{3,24}$"],
  ["invalid username format", { ...validUpdate, username: "lea-2" }, "username must match ^[a-z0-9_]{3,24}$"],
  ["non-string username", { ...validUpdate, username: 42 }, "username must match ^[a-z0-9_]{3,24}$"],
  ["long bio", { ...validUpdate, bio: "b".repeat(161) }, "bio must be null or contain no more than 160 chars"],
  ["non-string bio", { ...validUpdate, bio: 42 }, "bio must be null or contain no more than 160 chars"],
  ["missing bio", { displayName: "Léa", username: "lea" }, "bio must be null or contain no more than 160 chars"],
  ["empty body", {}, "displayName must be between 1 and 60 chars"],
  ["array body", [], "displayName must be between 1 and 60 chars"],
] as const;

for (const [label, payload, error] of invalidUpdates) {
  test(`PUT /me/profile rejects ${label} before calling the updater`, async () => {
    let calls = 0;
    const { app, token } = await createToken(async () => null, randomUUID(), {},
      async () => { calls++; throw new Error("unexpected update"); },
    );
    try {
      const response = await app.inject({
        method: "PUT", url: "/me/profile",
        headers: { authorization: `Bearer ${token}` }, payload,
      });
      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.json(), { error });
      assert.equal(calls, 0);
    } finally {
      await app.close();
    }
  });
}

for (const { label, subject, withToken } of [
  { label: "a missing subject", subject: undefined, withToken: true },
  { label: "a non-UUID subject", subject: "invalid-uuid", withToken: true },
  { label: "a non-string subject", subject: 42, withToken: true },
  { label: "a missing token", subject: randomUUID(), withToken: false },
]) {
  test(`PUT /me/profile rejects ${label}`, async () => {
    let calls = 0;
    const { app, token } = await createToken(async () => null, subject, {},
      async () => { calls++; throw new Error("unexpected update"); },
    );
    try {
      const response = await app.inject({
        method: "PUT", url: "/me/profile", payload: validUpdate,
        headers: withToken ? { authorization: `Bearer ${token}` } : {},
      });
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), { error: "unauthorized" });
      assert.equal(calls, 0);
    } finally {
      await app.close();
    }
  });
}

test("PUT /me/profile uses only the JWT sub for identity", async () => {
  const userId = randomUUID();
  const otherId = randomUUID();
  const calls: unknown[] = [];
  const { app, token } = await createToken(async () => null, userId, { userId: otherId },
    async (id, values) => {
      calls.push({ id, values });
      return { userId: id, ...values, avatarUrl: null };
    },
  );
  try {
    const response = await app.inject({
      method: "PUT", url: `/me/profile?userId=${otherId}`,
      headers: { authorization: `Bearer ${token}`, "x-user-id": otherId },
      payload: { ...validUpdate, userId: otherId, sub: otherId },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [{ id: userId, values: validUpdate }]);
    assert.deepEqual(response.json(), { userId, ...validUpdate, avatarUrl: null });
  } finally {
    await app.close();
  }
});

for (const conflict of [true, false]) {
  test(`PUT /me/profile maps ${conflict ? "a username conflict to 409" : "an unexpected failure to a generic 500"}`, async () => {
    let calls = 0;
    const { app, token } = await createToken(async () => null, randomUUID(), {},
      async () => {
        calls++;
        throw conflict ? new UsernameConflictError() : new Error("private database details");
      },
    );
    try {
      const response = await app.inject({
        method: "PUT", url: "/me/profile",
        headers: { authorization: `Bearer ${token}` }, payload: validUpdate,
      });
      assert.equal(response.statusCode, conflict ? 409 : 500);
      assert.deepEqual(response.json(), { error: conflict ? "username already in use" : "internal server error" });
      assert.equal(calls, 1);
    } finally {
      await app.close();
    }
  });
}

test("GET /me returns exactly the allowed profile DTO", async () => {
  const userId = randomUUID();
  const storedProfile = {
    userId,
    displayName: "Léa",
    username: "lea",
    bio: null,
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
      bio: null,
      avatarUrl: null,
    });
    assert.deepEqual(Object.keys(body).sort(), [
      "avatarUrl",
      "bio",
      "displayName",
      "userId",
      "username",
    ]);
  } finally {
    await app.close();
  }
});

test("GET /me returns a stored bio without exposing internal fields", async () => {
  const userId = randomUUID();
  const readProfile: ProfileReader = async () => ({
    userId,
    displayName: "Léa",
    username: "lea",
    bio: "Learning distributed systems.",
    avatarUrl: null,
  });
  const { app, token } = await createToken(readProfile, userId);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json<ProfileDto>(), {
      userId,
      displayName: "Léa",
      username: "lea",
      bio: "Learning distributed systems.",
      avatarUrl: null,
    });
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
      bio: null,
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
    profileUpdater: unexpectedProfileUpdate,
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
    profileUpdater: unexpectedProfileUpdate,
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

test("PUT /internal/profiles normalizes the username at the Users boundary", async () => {
  const receivedCommands: ProfileProvisionCommand[] = [];
  const app = buildApp({
    internalServiceToken,
    jwtSecret,
    logger: false,
    profileUpdater: unexpectedProfileUpdate,
    provisionProfile: async (command) => {
      receivedCommands.push(command);
      return { status: "created" };
    },
    readProfile: async () => null,
  });
  const command = createProvisionCommand(randomUUID(), " ALICE_2 ");

  try {
    const response = await app.inject({
      method: "PUT",
      url: `/internal/profiles/${command.aggregateId}`,
      headers: { authorization: `Bearer ${internalServiceToken}` },
      payload: command,
    });

    assert.equal(response.statusCode, 201);
    assert.equal(receivedCommands[0]?.data.username, "alice_2");
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
    profileUpdater: unexpectedProfileUpdate,
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
    profileUpdater: unexpectedProfileUpdate,
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

function avatarMultipart(bytes: Buffer, mime = "image/png", field = "avatar") {
  const boundary = "pce-test-boundary";
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="image.png"\r\nContent-Type: ${mime}\r\n\r\n`),
      bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

async function avatarApp() {
  const userId = randomUUID();
  const files = new Map<string, Buffer>();
  const writes: string[] = [];
  const reads: string[] = [];
  const profile: ProfileDto = { userId, displayName: "Léa", username: "lea", bio: "Bio", avatarUrl: null };
  const app = buildApp({
    jwtSecret, logger: false,
    readProfile: async () => profile, profileUpdater: unexpectedProfileUpdate,
    writeAvatar: async (id, fileName, bytes) => {
      assert.equal(id, userId);
      writes.push(fileName);
      files.set(fileName, bytes);
      profile.avatarUrl = `/api/users/avatars/${fileName}`;
      return { ...profile, privateField: "excluded" };
    },
    readAvatar: async (fileName) => {
      reads.push(fileName);
      return files.get(fileName) ?? null;
    },
  });
  await app.ready();
  const token = app.jwt.sign({ sub: userId });
  return { app, token, files, writes, reads, profile };
}

for (const mime of ["image/png", "image/jpeg", "image/webp"]) {
  test(`avatar accepts ${mime} and serves exactly the uploaded bytes`, async () => {
    const { app, token, profile } = await avatarApp();
    const bytes = Buffer.from([137, 80, 78, 71, 0, 1, 2, 255]);
    try {
      const body = avatarMultipart(bytes, mime);
      const uploaded = await app.inject({ method: "POST", url: "/me/avatar", ...body,
        headers: { ...body.headers, authorization: `Bearer ${token}` } });
      assert.equal(uploaded.statusCode, 200);
      assert.deepEqual(uploaded.json(), profile);
      const fetched = await app.inject({ method: "GET", url: profile.avatarUrl!.replace("/api/users", "") });
      assert.equal(fetched.statusCode, 200);
      assert.equal(fetched.headers["content-type"], mime);
      assert.deepEqual(fetched.rawPayload, bytes);
    } finally { await app.close(); }
  });
}

for (const [label, field, mime, size, status] of [
  ["wrong field", "photo", "image/png", 1, 400],
  ["forbidden MIME", "avatar", "text/plain", 1, 415],
  ["over limit", "avatar", "image/png", maxAvatarBytes + 1, 413],
  ["exact size limit", "avatar", "image/png", maxAvatarBytes, 200],
] as const) {
  test(`avatar handles ${label} with status ${status}`, async () => {
    const { app, token, writes, files } = await avatarApp();
    try {
      const body = avatarMultipart(Buffer.alloc(size), mime, field);
      const response = await app.inject({ method: "POST", url: "/me/avatar", ...body,
        headers: { ...body.headers, authorization: `Bearer ${token}` } });
      assert.equal(response.statusCode, status);
      if (status !== 200) assert.deepEqual(writes, []);
      else assert.equal([...files.values()][0]!.length, size);
    } finally { await app.close(); }
  });
}

for (const subject of [undefined, "not-a-uuid"]) {
  test(`avatar requires an authenticated UUID (${String(subject)})`, async () => {
    const { app, writes } = await avatarApp();
    try {
      const body = avatarMultipart(Buffer.from("test"));
      const response = await app.inject({ method: "POST", url: "/me/avatar", ...body,
        headers: { ...body.headers, ...(subject ? { authorization: `Bearer ${app.jwt.sign({ sub: subject })}` } : {}) } });
      assert.equal(response.statusCode, 401);
      assert.deepEqual(writes, []);
    } finally { await app.close(); }
  });
}

test("avatar rejects a missing file", async () => {
  const { app, token, writes } = await avatarApp();
  try {
    const response = await app.inject({ method: "POST", url: "/me/avatar",
      headers: { authorization: `Bearer ${token}` }, payload: {} });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(writes, []);
  } finally { await app.close(); }
});

for (const name of ["..%2Fsecret.png", "..", "secret.png", "%5Csecret.png"]) {
  test(`avatar rejects unsafe filename ${name} before storage access`, async () => {
    const { app, reads } = await avatarApp();
    try {
      const response = await app.inject({ method: "GET", url: `/avatars/${name}` });
      // The HTTP client normalizes the literal parent segment before routing.
      assert.equal(response.statusCode, name === ".." ? 404 : 400);
      assert.deepEqual(reads, []);
    } finally { await app.close(); }
  });
}

test("avatar returns 404 for an absent authorized filename", async () => {
  const { app } = await avatarApp();
  try {
    const response = await app.inject({ method: "GET", url: `/avatars/${randomUUID()}-${randomUUID()}.png` });
    assert.equal(response.statusCode, 404);
  } finally { await app.close(); }
});
