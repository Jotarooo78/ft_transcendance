import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildApp } from "./app.js";
import {
  DuplicateEmailError,
  type AccountForLogin,
  type CreateRegistrationInput,
  type PendingProfileProvision,
  PermanentProfileProvisionError,
  type PermanentProvisionCode,
  type RegistrationStore,
  deliverProfileProvision,
} from "./provisioning.js";

const jwtSecret = "test-only-auth-service-secret-with-sufficient-length";

class InMemoryRegistrationStore implements RegistrationStore {
  readonly accounts = new Map<string, AccountForLogin>();
  readonly messages = new Map<
    string,
    { message: PendingProfileProvision; status: "pending" | "delivered" | "failed" }
  >();

  async checkReady(): Promise<void> {}

  async createPendingRegistration(input: CreateRegistrationInput) {
    if (this.accounts.has(input.email)) {
      throw new DuplicateEmailError();
    }

    const id = randomUUID();
    const account: AccountForLogin = {
      id,
      email: input.email,
      passwordHash: input.passwordHash,
      state: "pending_profile",
    };
    const message: PendingProfileProvision = {
      eventId: randomUUID(),
      userId: id,
      aggregateVersion: 1,
      occurredAt: new Date().toISOString(),
      displayName: input.displayName,
      username: input.username,
      attempts: 0,
    };
    this.accounts.set(input.email, account);
    this.messages.set(message.eventId, { message, status: "pending" });
    return { account: { id, email: input.email }, message };
  }

  async findAccountByEmail(email: string) {
    return this.accounts.get(email) ?? null;
  }

  async listPendingProvisions(limit: number) {
    return [...this.messages.values()]
      .filter(({ status }) => status === "pending")
      .slice(0, limit)
      .map(({ message }) => message);
  }

  async markProvisionAttemptFailed(message: PendingProfileProvision) {
    message.attempts += 1;
  }

  async markProvisioned(message: PendingProfileProvision) {
    const record = this.messages.get(message.eventId);
    if (record) {
      record.status = "delivered";
    }
    const account = [...this.accounts.values()].find(
      ({ id }) => id === message.userId,
    );
    if (account?.state === "pending_profile") {
      account.state = "active";
    }
  }

  async markProvisionPermanentlyFailed(
    message: PendingProfileProvision,
    _errorCode: PermanentProvisionCode,
  ) {
    const record = this.messages.get(message.eventId);
    if (record) {
      record.status = "failed";
    }
    const account = [...this.accounts.values()].find(
      ({ id }) => id === message.userId,
    );
    if (account?.state === "pending_profile") {
      account.state = "profile_failed";
    }
  }
}

function createTestApp(
  store: InMemoryRegistrationStore,
  profileProvisioner: (message: PendingProfileProvision) => Promise<void>,
) {
  return buildApp({
    jwtSecret,
    logger: false,
    passwordHasher: async (password) => `hashed:${password}`,
    passwordVerifier: async (hash, password) => hash === `hashed:${password}`,
    profileProvisioner,
    registrationStore: store,
  });
}

const validSignup = {
  email: "lea@example.invalid",
  password: "password1234",
  username: "lea",
  displayName: "Léa",
};

test("signup activates the account only after profile provisioning succeeds", async () => {
  const store = new InMemoryRegistrationStore();
  const delivered: PendingProfileProvision[] = [];
  const app = createTestApp(store, async (message) => {
    delivered.push(message);
  });

  try {
    const signupResponse = await app.inject({
      method: "POST",
      url: "/signup",
      payload: validSignup,
    });

    assert.equal(signupResponse.statusCode, 201);
    const signupBody = signupResponse.json<{
      status: string;
      userId: string;
      nextAction: string;
    }>();
    assert.deepEqual(signupBody, {
      status: "registered",
      userId: delivered[0]?.userId,
      nextAction: "login",
    });
    assert.equal(delivered[0]?.username, "lea");
    assert.equal(delivered[0]?.displayName, "Léa");
    assert.equal(store.accounts.get(validSignup.email)?.state, "active");

    const loginResponse = await app.inject({
      method: "POST",
      url: "/login",
      payload: {
        email: validSignup.email,
        password: validSignup.password,
      },
    });
    assert.equal(loginResponse.statusCode, 200);
    const token = loginResponse.json<{ token: string }>().token;
    const claims = app.jwt.verify<{ sub: string }>(token);
    assert.equal(claims.sub, signupBody.userId);
  } finally {
    await app.close();
  }
});

test("a transient Users failure returns pending, blocks login, then converges on replay", async () => {
  const store = new InMemoryRegistrationStore();
  const app = createTestApp(store, async () => {
    throw new Error("temporary Users outage");
  });

  try {
    const signupResponse = await app.inject({
      method: "POST",
      url: "/signup",
      payload: validSignup,
    });
    assert.equal(signupResponse.statusCode, 202);
    assert.equal(signupResponse.json<{ code: string }>().code, "REGISTRATION_PENDING");
    assert.equal(
      store.accounts.get(validSignup.email)?.state,
      "pending_profile",
    );

    const pendingLogin = await app.inject({
      method: "POST",
      url: "/login",
      payload: {
        email: validSignup.email,
        password: validSignup.password,
      },
    });
    assert.equal(pendingLogin.statusCode, 202);
    assert.equal(
      pendingLogin.json<{ code: string }>().code,
      "REGISTRATION_PENDING",
    );

    const [pendingMessage] = await store.listPendingProvisions(1);
    assert.ok(pendingMessage);
    const replayResult = await deliverProfileProvision(
      store,
      async () => {},
      pendingMessage,
    );
    assert.deepEqual(replayResult, { status: "delivered" });
    assert.equal(store.accounts.get(validSignup.email)?.state, "active");

    const activeLogin = await app.inject({
      method: "POST",
      url: "/login",
      payload: {
        email: validSignup.email,
        password: validSignup.password,
      },
    });
    assert.equal(activeLogin.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("a username conflict is permanent and leaves no usable account", async () => {
  const store = new InMemoryRegistrationStore();
  const app = createTestApp(store, async () => {
    throw new PermanentProfileProvisionError("USERNAME_TAKEN");
  });

  try {
    const signupResponse = await app.inject({
      method: "POST",
      url: "/signup",
      payload: validSignup,
    });
    assert.equal(signupResponse.statusCode, 409);
    assert.equal(
      signupResponse.json<{ code: string }>().code,
      "USERNAME_TAKEN",
    );
    assert.equal(
      store.accounts.get(validSignup.email)?.state,
      "profile_failed",
    );

    const loginResponse = await app.inject({
      method: "POST",
      url: "/login",
      payload: {
        email: validSignup.email,
        password: validSignup.password,
      },
    });
    assert.equal(loginResponse.statusCode, 409);
    assert.equal(
      loginResponse.json<{ code: string }>().code,
      "REGISTRATION_FAILED",
    );
  } finally {
    await app.close();
  }
});

test("signup validates profile fields before writing", async () => {
  const store = new InMemoryRegistrationStore();
  const app = createTestApp(store, async () => {});

  try {
    const response = await app.inject({
      method: "POST",
      url: "/signup",
      payload: {
        email: validSignup.email,
        password: validSignup.password,
        username: validSignup.username,
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(store.accounts.size, 0);
    assert.equal(store.messages.size, 0);
  } finally {
    await app.close();
  }
});
