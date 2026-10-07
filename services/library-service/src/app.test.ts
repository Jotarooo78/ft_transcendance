import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "./app.js";
import { createInput, pageQuery, toPlaylist } from "./playlist.js";

const owner = "40000000-0000-4000-8000-000000000001", other = "40000000-0000-4000-8000-000000000002";
const id = "50000000-0000-4000-8000-000000000001";
const playlist = { id, name: "Private", description: "", version: 1, items: [] };

test("create empty private playlist uses authenticated owner and validates the entire body", async t => {
  let writes = 0; let failure = false; let saved: typeof playlist | null = null;
  const app = buildApp({ jwtSecret: "test-only-library-secret", ready: async () => {},
    readPlaylists: async () => ({ page: 1, pageSize: 20, total: saved ? 1 : 0, items: saved ? [saved] : [] }),
    readPlaylist: async (subject, value) => subject === owner && value === id ? saved : null,
    createPlaylist: async (subject, input) => { writes++; assert.equal(subject, owner);
      if (failure) throw new Error("private SQL"); saved = { ...playlist, ...input }; return saved; },
  });
  t.after(() => app.close()); await app.ready();
  const headers = { authorization: `Bearer ${app.jwt.sign({ sub: owner })}` };
  assert.equal((await app.inject({ method: "POST", url: "/playlists", payload: { name: "Unauthenticated" } })).statusCode, 401);
  for (const payload of [{}, [], {name:""}, {name:"   "}, {name:"x".repeat(101)}, {name:"ok",description:"x".repeat(2001)},
    {name:"ok",description:null}, {name:"ok",ownerUserId:other}, {name:"ok",visibility:"public"}, {name:"ok",version:5}]) {
    assert.equal((await app.inject({method:"POST",url:"/playlists",headers,payload})).statusCode,400);
  }
  assert.equal(writes,0);
  const result = await app.inject({ method:"POST",url:"/playlists",headers,payload:{name:"  Empty playlist  ",description:"  Notes  "} });
  assert.equal(result.statusCode,201); assert.deepEqual(result.json(),{...playlist,name:"Empty playlist",description:"Notes"});
  assert.deepEqual((await app.inject({url:`/playlists/${id}`,headers})).json(),result.json());
  assert.deepEqual(createInput({name:"🎵".repeat(100)}),{name:"🎵".repeat(100),description:""});
  failure = true;
  const outage = await app.inject({ method:"POST",url:"/playlists",headers,payload:{name:"Later"} });
  assert.equal(outage.statusCode,503); assert.deepEqual(outage.json(),{error:"library_unavailable"});
});

test("JWT verification precedes storage and ownership scopes every read", async t => {
  let calls = 0; let failure = false;
  const app = buildApp({ jwtSecret: "test-only-library-secret", ready: async () => {},
    readPlaylists: async (subject, query) => { calls++; if (failure) throw new Error("private SQL");
      return { ...query, total: subject === owner ? 1 : 0, items: subject === owner ? [playlist] : [] }; },
    readPlaylist: async (subject, value) => { calls++; if (failure) throw new Error("private SQL"); return subject === owner && value === id ? playlist : null; },
  });
  const foreign = buildApp({ jwtSecret: "another-test-secret", ready: async () => {},
    readPlaylists: async () => { throw new Error("unused"); }, readPlaylist: async () => null });
  t.after(async () => { await app.close(); await foreign.close(); });
  await app.ready(); await foreign.ready();
  for (const token of [undefined, "not-a-jwt", foreign.jwt.sign({ sub: owner }), app.jwt.sign({ sub: owner, exp: 1 }),
    app.jwt.sign({ sub: "not-uuid" }), app.jwt.sign({}), app.jwt.sign({ sub: 123 })]) {
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    for (const url of ["/playlists", `/playlists/${id}`]) assert.equal((await app.inject({ url, headers })).statusCode, 401);
  }
  assert.equal(calls, 0);
  const headers = { authorization: `Bearer ${app.jwt.sign({ sub: owner })}` };
  assert.deepEqual((await app.inject({ url: `/playlists/${id}`, headers })).json(), playlist);
  const list = await app.inject({ url: "/playlists?pageSize=1", headers });
  assert.equal(list.statusCode, 200); assert.equal(list.headers["cache-control"], "no-store");
  assert.deepEqual(list.json(), { items: [playlist], total: 1, page: 1, pageSize: 1 });
  const b = { authorization: `Bearer ${app.jwt.sign({ sub: other })}` };
  assert.equal((await app.inject({ url: `/playlists/${id}`, headers: b })).statusCode, 404);
  assert.deepEqual((await app.inject({ url: "/playlists", headers: b })).json().items, []);
  for (const query of ["page=0", "page=-1", "page=1.1", "pageSize=101", "page=1&page=2", "ownerUserId=x", "page=9007199254740992", "page=9007199254740991&pageSize=100"]) {
    assert.equal((await app.inject({ url: `/playlists?${query}`, headers })).statusCode, 400);
  }
  assert.equal((await app.inject({ url: "/playlists/no", headers })).statusCode, 400);
  failure = true;
  for (const url of ["/playlists", `/playlists/${id}`]) {
    const r = await app.inject({ url, headers }); assert.equal(r.statusCode, 503); assert.deepEqual(r.json(), { error: "library_unavailable" });
  }
  assert.equal((await app.inject("/health")).statusCode, 200);
  assert.equal((await app.inject("/ready")).statusCode, 200);
  assert.match((await app.inject("/metrics")).body, /library_service_/);
});

test("DTO has safe version, separate occurrences and no owner fields", () => {
  const items = [{ id: "item-a", trackId: "same-track", position: 1 }, { id: "item-b", trackId: "same-track", position: 3 }];
  const row = { ...playlist, description: null, version: 1n, items, ownerUserId: owner };
  assert.deepEqual(toPlaylist(row), { ...playlist, items });
  assert.throws(() => toPlaylist({ ...row, version: 9007199254740992n }));
  assert.deepEqual(pageQuery({}), { page: 1, pageSize: 20 });
  assert.throws(() => buildApp({ jwtSecret: "", ready: async () => {}, readPlaylist: async () => null,
    readPlaylists: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }) }));
});
