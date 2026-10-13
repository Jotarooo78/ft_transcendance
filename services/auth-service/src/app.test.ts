/** Tests HTTP injectés Auth : inscription durable, profil en attente, livraison, conflits, connexion et refus ; le stockage est simulé en mémoire. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildApp, normalizeUsername } from "./app.js";
import {
  DuplicateEmailError,
  type AccountForLogin,
  type CreateRegistrationInput,
  type PendingProfileProvision,
  PermanentProfileProvisionError,
  type PermanentProvisionCode,
  type RegistrationStore,
  deliverProfileProvision,
} from "./handle-profile-creation-result.js";

/**
 * Secret public réservé aux jetons de ces tests injectés ; ne doit pas être utilisé par un serveur
 * réel.
 */
const jwtSecret = "test-only-auth-service-secret-with-sufficient-length";

/**
 * Doublure de RegistrationStore en mémoire pour contrôler les transitions du compte et de sa demande
 * sans PostgreSQL.
 */
class InMemoryRegistrationStore implements RegistrationStore {
  /** Comptes de test en mémoire, indexés par email. */
  readonly accounts = new Map<string, AccountForLogin>();
  /** Demandes de profil de test en mémoire, indexées par eventId. */
  readonly messages = new Map<
    string,
    {
      /** Message de suivi ou demande à transmettre, selon le contrat contenant ce champ. */
      message: PendingProfileProvision;
      /** État simulé de livraison de la demande dans la boîte d’envoi du test. */
      status: "pending" | "delivered" | "failed" }
  >();

  /** Simule un stockage disponible, sans requête SQL. */
  async checkReady(): Promise<void> {}

  /** Crée les deux objets de test et refuse un email déjà présent dans la Map. */
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

  /** Relit le compte de test en mémoire ou renvoie null. */
  async findAccountByEmail(email: string) {
    return this.accounts.get(email) ?? null;
  }

  /** Retourne les seuls messages pending jusqu’à la limite ; aucun délai réel de stockage n’est simulé. */
  async listPendingProvisions(limit: number) {
    return [...this.messages.values()]
      .filter(({ status }) => status === "pending")
      .slice(0, limit)
      .map(({ message }) => message);
  }

  /** Incrémente le compteur de tentative de la demande de test. */
  async markProvisionAttemptFailed(message: PendingProfileProvision) {
    message.attempts += 1;
  }

  /** Marque la demande delivered et active le compte de test encore en attente. */
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

  /** Marque la demande failed et le compte profile_failed dans les objets de test. */
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

/**
 * Construit Auth avec stockage mémoire et hachage factice déterministe ; ce hachage ne doit jamais
 * servir à une application réelle.
 */
function createTestApp(
  store: InMemoryRegistrationStore,
  profileProvisioner: (message: PendingProfileProvision) => Promise<void>,
) {
  return buildApp({
    jwtSecret,
    logger: false,
    /**
     * Doublure du scénario pour hachage déterministe réservé aux tests ; la réponse ou la panne est
     * contrôlée par le test.
     */
    passwordHasher: async (password) => `hashed:${password}`,
    /**
     * Doublure du scénario pour vérification du hachage factice ; la réponse ou la panne est contrôlée par
     * le test.
     */
    passwordVerifier: async (hash, password) => hash === `hashed:${password}`,
    profileProvisioner,
    registrationStore: store,
  });
}

/** Entrée d’inscription de test connue valide, réutilisée pour isoler les refus. */
const validSignup = {
  email: "lea@example.invalid",
  password: "password1234",
  username: "lea",
  displayName: "Léa",
};

test("username normalization implements the canonical contract", () => {
  assert.equal(normalizeUsername(" Alice "), "alice");
  assert.equal(normalizeUsername("ALICE_2"), "alice_2");
  assert.equal(normalizeUsername("ab"), null);
  assert.equal(normalizeUsername("alice-2"), null);
  assert.equal(normalizeUsername(null), null);
});

test("signup provisions the canonical username", async () => {
  const store = new InMemoryRegistrationStore();
  const delivered: PendingProfileProvision[] = [];
  const app = createTestApp(store, async (message) => {
    delivered.push(message);
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/signup",
      payload: { ...validSignup, username: " ALICE_2 " },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(delivered[0]?.username, "alice_2");
  } finally {
    await app.close();
  }
});

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
      /** Statut HTTP du refus conservé pour que la route ou le client le traite. */
      status: string;
      /** UUID du compte auquel le profil ou la demande est rattaché. */
      userId: string;
      /** Action contrôlée du scénario, sans effet sur une vraie interface utilisateur. */
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
    const token = loginResponse.json<{
      /** JWT signé avec le secret réservé au test ; ne représente aucune donnée de connexion réelle. */
      token: string }>().token;
    const claims = app.jwt.verify<{
      /** Sujet du JWT : UUID du compte, vérifié avant de servir des données privées. */
      sub: string }>(token);
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
    assert.equal(signupResponse.json<{
      /** Code de refus public ou code métier, distinct du message détaillé interne. */
      code: string }>().code, "REGISTRATION_PENDING");
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
      pendingLogin.json<{
        /** Code de refus public ou code métier, distinct du message détaillé interne. */
        code: string }>().code,
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
      signupResponse.json<{
        /** Code de refus public ou code métier, distinct du message détaillé interne. */
        code: string }>().code,
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
      loginResponse.json<{
        /** Code de refus public ou code métier, distinct du message détaillé interne. */
        code: string }>().code,
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
