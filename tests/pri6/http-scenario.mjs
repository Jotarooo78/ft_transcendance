import assert from "node:assert/strict";

const authUrl = process.env.AUTH_URL;
const userUrl = process.env.USER_URL;
const email = process.env.PRI6_EMAIL;
const password = process.env.PRI6_PASSWORD;
const username = process.env.PRI6_USERNAME;
const displayName = process.env.PRI6_DISPLAY_NAME;
const mode = process.argv[2];

for (const [name, value] of Object.entries({
  AUTH_URL: authUrl,
  USER_URL: userUrl,
  PRI6_EMAIL: email,
  PRI6_PASSWORD: password,
  PRI6_USERNAME: username,
  PRI6_DISPLAY_NAME: displayName,
})) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { body, status: response.status };
}

async function waitUntilReady() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const [auth, users] = await Promise.all([
      request(`${authUrl}/ready`).catch(() => ({ status: 0 })),
      request(`${userUrl}/ready`).catch(() => ({ status: 0 })),
    ]);

    if (auth.status === 200 && users.status === 200) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Auth and Users did not become ready within 60 seconds");
}

async function loginAndReadProfile() {
  let login;

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    login = await request(`${authUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (login.status === 200) {
      break;
    }

    if (login.status !== 202) {
      assert.fail(`login returned ${login.status}: ${JSON.stringify(login.body)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  assert.equal(login?.status, 200);
  assert.equal(typeof login.body?.token, "string");

  const profile = await request(`${userUrl}/me`, {
    headers: { authorization: `Bearer ${login.body.token}` },
  });

  assert.equal(profile.status, 200);
  assert.deepEqual(Object.keys(profile.body).sort(), [
    "avatarUrl",
    "displayName",
    "userId",
    "username",
  ]);
  assert.equal(profile.body.displayName, displayName);
  assert.equal(profile.body.username, username);
  assert.equal(profile.body.avatarUrl, null);
  assert.match(profile.body.userId, /^[0-9a-f-]{36}$/i);

  return profile.body.userId;
}

async function runInitialScenario() {
  const signup = await request(`${authUrl}/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, username, displayName }),
  });

  assert.ok(
    signup.status === 201 || signup.status === 202,
    `signup returned ${signup.status}: ${JSON.stringify(signup.body)}`,
  );

  const userId = await loginAndReadProfile();
  if (signup.status === 201) {
    assert.equal(signup.body.userId, userId);
  }

  const duplicateEmail = await request(`${authUrl}/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      username: "unused_duplicate_email",
      displayName: "Duplicate Email",
    }),
  });
  assert.equal(duplicateEmail.status, 409);
  assert.equal(duplicateEmail.body.code, "ACCOUNT_ALREADY_EXISTS");

  const missingField = await request(`${authUrl}/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "missing@example.invalid", password }),
  });
  assert.equal(missingField.status, 400);

  const unknownUser = await request(`${authUrl}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "unknown@example.invalid",
      password: "unknown-password-42",
    }),
  });
  assert.equal(unknownUser.status, 401);

  const duplicateUsername = await request(`${authUrl}/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "pri6-duplicate-username@example.invalid",
      password,
      username,
      displayName: "Duplicate Username",
    }),
  });
  assert.equal(duplicateUsername.status, 409);
  assert.equal(duplicateUsername.body.code, "USERNAME_TAKEN");

  console.log(`PRI-6 initial HTTP scenario passed for user ${userId}`);
}

await waitUntilReady();

if (mode === "initial") {
  await runInitialScenario();
} else if (mode === "resume") {
  const userId = await loginAndReadProfile();
  console.log(`PRI-6 persisted HTTP scenario passed for user ${userId}`);
} else {
  throw new Error("usage: node http-scenario.mjs <initial|resume>");
}
