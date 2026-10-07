import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { catalogReader } from "./catalog.js";
import { buildApp } from "./app.js";
import { createInput, pageQuery, PlaylistError, toPlaylist, type Playlist } from "./playlist.js";

const owner = "40000000-0000-4000-8000-000000000001", other = "40000000-0000-4000-8000-000000000002";
const id = "50000000-0000-4000-8000-000000000001";
const playlist = { id, name: "Private", description: "", version: 1, items: [] };

test("adding an occurrence checks owner, version and Catalogue before writing", async t => {
  const trackId = "20000000-0000-4000-8000-000000000001";
  let state: Playlist = { ...playlist, items: [] }; let lookups = 0, writes = 0;
  let available = true, outage = false, conflict = false;
  const app = buildApp({ jwtSecret: "test-only-library-secret", ready: async () => {},
    readPlaylists: async () => ({ page: 1, pageSize: 20, total: 1, items: [state] }),
    readPlaylist: async subject => subject === owner ? state : null,
    isTrackPublished: async () => { lookups++; if (outage) throw new Error("timeout"); return available; },
    addItem: async (subject, playlistId, track, version) => {
      assert.equal(subject,owner); assert.equal(playlistId,id); assert.equal(track,trackId);
      if (conflict || version !== state.version) throw new PlaylistError(409,"version_conflict");
      writes++; state = { ...state, version: state.version+1,
        items: [...state.items, {id:`item-${writes}`,trackId:track,position:writes}] }; return state;
    },
  });
  t.after(() => app.close()); await app.ready();
  const headers = {authorization:`Bearer ${app.jwt.sign({sub:owner})}`};
  const url = `/playlists/${id}/items`, payload = {trackId,expectedVersion:1};
  assert.equal((await app.inject({method:"POST",url,headers:{authorization:`Bearer ${app.jwt.sign({sub:other})}`},payload})).statusCode,404);
  assert.equal((await app.inject({method:"POST",url,headers,payload:{...payload,expectedVersion:2}})).statusCode,409);
  assert.equal(lookups,0); assert.equal(writes,0);
  for (const invalid of [{trackId}, {...payload,trackId:"no"}, {...payload,expectedVersion:0}, {...payload,expectedVersion:1.5}, {...payload,ownerUserId:other}]) {
    assert.equal((await app.inject({method:"POST",url,headers,payload:invalid})).statusCode,400);
  }
  available = false; assert.equal((await app.inject({method:"POST",url,headers,payload})).statusCode,404);
  available = true; outage = true; assert.equal((await app.inject({method:"POST",url,headers,payload})).statusCode,503);
  outage = false; conflict = true; assert.equal((await app.inject({method:"POST",url,headers,payload})).statusCode,409);
  assert.equal(writes,0); conflict = false;
  assert.equal((await app.inject({method:"POST",url,headers,payload})).statusCode,200);
  const second = await app.inject({method:"POST",url,headers,payload:{...payload,expectedVersion:2}});
  assert.equal(second.statusCode,200); assert.equal(second.json().version,3);
  assert.deepEqual(second.json().items.map((item: {trackId:string})=>item.trackId),[trackId,trackId]);
  assert.notEqual(second.json().items[0].id,second.json().items[1].id);
});

test("Catalogue client distinguishes absent, malformed and timed-out tracks", async t => {
  let mode = "ok"; const trackId = "20000000-0000-4000-8000-000000000001";
  const server = createServer((_request,response) => {
    if (mode === "timeout") return;
    response.statusCode = mode === "missing" ? 404 : mode === "failure" ? 503 : 200;
    response.end(JSON.stringify({id:mode === "bad" ? "other" : trackId}));
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const read = catalogReader(`http://127.0.0.1:${address.port}`,100);
  assert.equal(await read(trackId),true); mode="missing"; assert.equal(await read(trackId),false);
  for(mode of ["bad","failure","timeout"]) await assert.rejects(read(trackId));
});

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
