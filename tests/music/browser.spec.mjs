/** Quatre parcours Chromium sur la pile musicale isolée : catalogue, écoute, playlists et historique avec comptes distincts. */
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Read-only SQL witness, confined to the same disposable project as the browser.
/**
 * Témoin SQL en lecture seule d’une session et de ses événements, confiné à transcendence_music après
 * validation de l’UUID.
 */
function playbackSql(id) {
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  const query = `SELECT json_build_object('id',s.id,'userId',s.user_id,'listenedMs',s.listened_ms,
    'lastSequence',s.last_sequence,'qualified',s.qualified,'endedAt',s.ended_at,
    'events',(SELECT json_agg(json_build_object('sequence',sequence,'positionMs',position_ms,
      'listenedMsTotal',listened_ms_total) ORDER BY sequence) FROM playback.events WHERE session_id=s.id))
    FROM playback.sessions s WHERE current_database()='transcendence_music' AND s.id='${id}'::uuid;`;
  return JSON.parse(execFileSync('docker', ['compose','-p','transcendence_music','--env-file','/dev/null',
    '-f',fileURLToPath(new URL('./compose.yml', import.meta.url)),'exec','-T','db','psql','-U','e2e_admin',
    '-d','transcendence_music','-v','ON_ERROR_STOP=1','-At','-c',query], { encoding:'utf8', timeout:10000 }).trim());
}
/** Reconnaît une confirmation réelle PUT /progress réussie pour synchroniser les assertions navigateur. */
const playbackProgress = r => r.request().method() === 'PUT' && /\/api\/playback\/sessions\/[^/]+\/progress$/.test(r.url()) && r.status() === 200;
/**
 * Ouvre le morceau de démonstration et attend la vraie session ainsi que les octets Media ; lance le
 * lecteur commun et renvoie la session et son élément audio réel.
 */
async function startPlayback(page) {
  await page.getByRole('button', { name:'Catalog', exact:true }).click();
  await page.getByLabel('Search music',{exact:true}).fill('Aube');
  const opened = page.waitForResponse(r => r.url().endsWith('/api/playback/sessions') && r.request().method() === 'POST' && r.status() === 201);
  const media = page.waitForResponse(r => r.url().endsWith('/api/media/assets/30000000-0000-4000-8000-000000000001/audio') && [200,206].includes(r.status()));
  await page.getByRole('button',{name:'Play Aube — demo',exact:true}).click();
  await media;
  const audio=page.locator('audio');
  await expect.poll(()=>audio.evaluate(a=>a.duration)).toBeCloseTo(6,1);
  await audio.evaluate(a=>a.play());
  return { audio, session:await (await opened).json() };
}

test('playback: real listening, pause, seek, SQL, history and account isolation', async ({page}) => {
  const loggedIn=page.waitForResponse(r=>r.url().endsWith('/api/auth/login') && r.status()===200);
  const user=await createAccount(page,'eco_real');
  const token=(await (await loggedIn).json()).token, headers={Authorization:`Bearer ${token}`};
  /**
   * Relit l’historique par API authentifiée depuis le navigateur pour comparer les mesures visibles à la
   * confirmation serveur.
   */
  const readHistory=async()=>{const r=await page.request.get('/api/playback/sessions',{headers});expect(r.status()).toBe(200);return r.json();};
  const sent=[];
  page.on('request',r=>{if(r.method()==='PUT' && r.url().includes('/api/playback/'))sent.push(r.postDataJSON());});
  const confirmed=page.waitForResponse(playbackProgress);
  const {audio,session}=await startPlayback(page); await confirmed;
  await expect.poll(()=>audio.evaluate(a=>a.currentTime)).toBeGreaterThan(1.1);
  const pauseSaved=page.waitForResponse(playbackProgress);
  await audio.evaluate(a=>a.pause()); await pauseSaved;
  await expect(page.locator('.listening-status')).toHaveCount(0);
  const paused=(await readHistory()).items[0];
  expect(paused.id).toBe(session.id); expect(paused.listenedMs).toBeGreaterThan(400);
  // Intentional real-time observation: no synthetic timeupdate/playing events.
  await page.waitForTimeout(1200);
  expect((await readHistory()).items[0].listenedMs).toBe(paused.listenedMs);
  const seekSaved=page.waitForResponse(playbackProgress);
  await audio.evaluate(a=>{a.currentTime=4.5;}); await seekSaved;
  await expect.poll(async()=>(await readHistory()).items[0].positionMs).toBe(4500);
  const sought=(await readHistory()).items[0];
  expect(sought.listenedMs).toBe(paused.listenedMs);
  const closedResponse=page.waitForResponse(r=>r.url().endsWith(`/${session.id}/close`) && r.status()===200);
  await audio.evaluate(a=>a.play());
  const closed=await (await closedResponse).json();
  expect(closed.positionMs).toBe(6000); expect(closed.listenedMs).toBeGreaterThan(paused.listenedMs+700);
  expect(closed.listenedMs).toBeLessThan(paused.listenedMs+1800);
  const sql=playbackSql(session.id);
  expect(sql.userId).toBe(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub);
  expect(sql.listenedMs).toBe(closed.listenedMs); expect(sql.lastSequence).toBe(closed.lastSequence);
  expect(sql.events).toEqual(sent); expect(sql.events.length).toBe(closed.lastSequence);
  expect(sql.qualified).toBe(false); expect(sql.endedAt).not.toBeNull();
  await page.getByRole('button',{name:'History',exact:true}).click();
  const row=page.locator(`[data-session-id="${session.id}"]`);
  await expect(row).toContainText('Aube — demo');
  await expect(row.locator('time')).toHaveAttribute('datetime',closed.startedAt);
  await page.reload(); await login(page,user);
  await page.getByRole('button',{name:'History',exact:true}).click();
  expect((await readHistory()).items.find(item=>item.id===session.id).listenedMs).toBe(closed.listenedMs);
  // Catalogue failure must preserve the stored facts and disable replay.
  const tracks='**/api/catalog/tracks/20000000-0000-4000-8000-000000000001';
  await page.route(tracks,route=>route.fulfill({status:404,body:'{}'}));
  await page.getByRole('button',{name:'Catalog',exact:true}).click();
  await page.getByRole('button',{name:'History',exact:true}).click();
  await expect(row).toContainText('Track unavailable');
  await expect(row.getByRole('button',{name:'Play Aube — demo',exact:true})).toHaveCount(0);
  expect((await readHistory()).items.find(item=>item.id===session.id).listenedMs).toBe(closed.listenedMs);
  await page.unroute(tracks);
  const lists='**/api/playback/sessions?*';
  await page.route(lists,route=>route.abort());
  await returnToTab(page);
  await expect(page.getByText(/The update failed/)).toBeVisible();
  await expect(row).toBeVisible();
  await expect(page.getByText('No listening sessions on this page.',{exact:true})).toHaveCount(0);
  await page.unroute(lists); await returnToTab(page);
  await expect(row).toBeVisible();
  // Real open sessions exercise the 20-row boundary and honest Open state.
  for(let n=0;n<20;n++)expect((await page.request.post('/api/playback/sessions',{headers,data:{trackId:session.trackId}})).status()).toBe(201);
  await returnToTab(page);
  await expect(page.locator('[data-session-id]')).toHaveCount(20);
  await expect(page.locator('[data-session-id]').first().locator('time')).toBeVisible();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('[data-session-id]')).toHaveCount(1); await expect(row).toBeVisible();
  let release,arrived,finished;
  const gate=new Promise(r=>{release=r;}), captured=new Promise(r=>{arrived=r;}), complete=new Promise(r=>{finished=r;});
  let first=true;
  await page.route(lists,async route=>{
    if(!first)return route.continue(); first=false;
    const response=await route.fetch(); arrived(); await gate;
    try{await route.fulfill({response});}catch{/* A's cancelled read may have no consumer. */}finally{finished();}
  });
  await returnToTab(page); await captured;
  await page.getByRole('button',{name:'Log out',exact:true}).click();
  await page.getByRole('button',{name:'Register',exact:true}).click();
  await createAccount(page,'eco_other');
  await page.getByRole('button',{name:'History',exact:true}).click();
  await expect(page.getByText('No listening sessions on this page.',{exact:true})).toBeVisible();
  release(); await complete; await page.unroute(lists);
  await expect(page.locator('[data-session-id]')).toHaveCount(0);
});

test('playback: lost response after SQL write, bounded retry and audible save failure',async({page})=>{
  await createAccount(page,'eco_retry');
  let lost,confirmed,repeated=false,failed=0,failProgress=false;
  const pattern='**/api/playback/sessions/*/progress';
  // Un seul intercepteur reste installé : changer de phase ne libère pas une réponse en cours.
  await page.route(pattern,async route=>{
    if(failProgress){failed++;await route.abort('failed');return;}
    const payload=route.request().postDataJSON();
    const response=await route.fetch(); expect(response.status()).toBe(200);
    const saved=await response.json();
    if(!lost){lost={payload,saved}; await route.abort('failed'); return;}
    const isRepeat=!repeated;
    if(isRepeat){expect(payload).toEqual(lost.payload);expect(saved).toEqual(lost.saved);confirmed=saved;}
    await route.fulfill({response});
    if(isRepeat)repeated=true;
  });
  const {audio,session}=await startPlayback(page);
  await expect.poll(()=>repeated).toBe(true);
  expect(confirmed.id).toBe(session.id);
  const witness=playbackSql(session.id);
  expect(witness.events.filter(e=>e.sequence===lost.payload.sequence)).toEqual([lost.payload]);
  failProgress=true;
  await expect(page.locator('.listening-status')).toContainText('Listening progress could not be saved. Audio can continue.');
  expect(failed).toBe(3);
  const before=await audio.evaluate(a=>a.currentTime);
  await expect.poll(()=>audio.evaluate(a=>a.currentTime)).toBeGreaterThan(before+0.3);
  await audio.evaluate(a=>a.pause());
  await page.waitForTimeout(400); expect(failed).toBe(3);
  failProgress=false;
  await page.getByRole('button',{name:'Retry saving',exact:true}).click();
  await expect(page.locator('.listening-status')).toHaveCount(0);
  const closedResponse=page.waitForResponse(r=>r.url().endsWith(`/${session.id}/close`) && r.status()===200);
  await page.getByRole('button',{name:'Close audio player',exact:true}).click();
  const closed=await(await closedResponse).json(),sql=playbackSql(session.id);
  expect(sql.listenedMs).toBe(closed.listenedMs);expect(sql.events.length).toBe(closed.lastSequence);
  expect(sql.events.filter(e=>e.sequence===lost.payload.sequence)).toEqual([lost.payload]);
  expect(sql.events.map(e=>e.sequence)).toEqual(Array.from({length:closed.lastSequence},(_,n)=>n+1));
});

test('library: confirmed gestures, failures, persistence and account isolation', async ({ page, browser }) => {
  const loginResponse = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.status() === 200);
  const userA = await createAccount(page, 'library_a');
  const tokenA = (await (await loginResponse).json()).token;
  const witness = JSON.stringify([{ id: 'legacy-local', name: 'Local witness only', description: 'preserve', trackIds: [] }]);
  await page.evaluate(value => localStorage.setItem('ft-music:playlists:v1', value), witness);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(page.getByText('No playlists yet.', { exact: true })).toBeVisible();
  const create = page.locator('.playlist-form');
  await create.getByLabel('Name', { exact: true }).fill('Browser library');
  await create.getByLabel('Description', { exact: true }).fill('Keep draft');
  // Labelled network failures exercise UI behavior, not server persistence.
  await page.route('**/api/library/playlists', route => route.request().method() === 'POST' ? route.abort() : route.continue());
  await create.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await expect(create.getByRole('alert')).toBeVisible();
  await expect(create.getByLabel('Name', { exact: true })).toHaveValue('Browser library');
  await expect(create.getByLabel('Description', { exact: true })).toHaveValue('Keep draft');
  await page.unroute('**/api/library/playlists');
  const creation = page.waitForResponse(r => r.url().endsWith('/api/library/playlists') && r.request().method() === 'POST' && r.status() === 201);
  await create.getByRole('button', { name: 'Create playlist', exact: true }).click();
  const empty = await (await creation).json(); expect(empty.items).toEqual([]); expect(empty.version).toBe(1);
  await expect(page.getByRole('heading', { name: 'Tracks in Browser library', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  const add = page.getByRole('combobox', { name: 'Add Aube — demo to playlist', exact: true });
  for (let n = 0; n < 2; n++) {
    const response = page.waitForResponse(r => r.url().endsWith(`/${empty.id}/items`) && r.request().method() === 'POST' && r.status() === 200);
    await add.selectOption(empty.id); await response; await expect(add).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  const rows = page.locator('[data-item-id]'); await expect(rows).toHaveCount(2);
  const ids = await rows.evaluateAll(elements => elements.map(e => e.dataset.itemId)); expect(new Set(ids).size).toBe(2);
  const itemPattern = `**/api/library/playlists/${empty.id}/items/*`;
  await page.route(itemPattern, route => route.abort());
  await rows.first().getByRole('button', { name: 'Remove track', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(rows).toHaveCount(2); await page.unroute(itemPattern);
  await rows.first().getByRole('button', { name: 'Remove track', exact: true }).click();
  await expect(rows).toHaveCount(1); await expect(rows.first()).toHaveAttribute('data-item-id', ids[1]);
  await page.getByRole('button', { name: 'Edit playlist', exact: true }).click();
  const edit = page.getByRole('form', { name: 'Edit playlist', exact: true });
  await edit.getByLabel('Name', { exact: true }).fill('Renamed library');
  await edit.getByLabel('Description', { exact: true }).fill('Saved description');
  const detailPattern = `**/api/library/playlists/${empty.id}`;
  await page.route(detailPattern, route => route.request().method() === 'PATCH' ? route.abort() : route.continue());
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(edit.getByRole('alert')).toBeVisible();
  await expect(edit.getByLabel('Name', { exact: true })).toHaveValue('Renamed library');
  await expect(edit.getByLabel('Description', { exact: true })).toHaveValue('Saved description');
  await page.unroute(detailPattern);
  const headers = { Authorization: `Bearer ${tokenA}` };
  const changed = await page.request.patch(`/api/library/playlists/${empty.id}`, { headers, data: { name: 'Changed elsewhere', expectedVersion: 4 } });
  expect(changed.status()).toBe(200);
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(edit.getByRole('alert')).toContainText('Your action was not applied');
  await expect(page.getByRole('heading', { name: 'Tracks in Changed elsewhere', exact: true })).toBeVisible();
  await expect(edit.getByLabel('Name', { exact: true })).toHaveValue('Renamed library');
  const updated = page.waitForResponse(r => r.request().method() === 'PATCH' && r.status() === 200);
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  const persisted = await (await updated).json(); await expect(edit).toHaveCount(0);
  expect(persisted.id).toBe(empty.id); expect(persisted.items[0].id).toBe(ids[1]); expect(persisted.version).toBe(6);
  // A new login after reload must issue a fresh Library read with the same identities.
  await page.reload(); await login(page, userA);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tracks in Renamed library', exact: true })).toBeVisible();
  await expect(rows.first()).toHaveAttribute('data-item-id', ids[1]);
  const fresh = await browser.newContext({ baseURL: 'https://127.0.0.1:3443', locale: "en-US", ignoreHTTPSErrors: true });
  try {
    const other = await fresh.newPage(); await other.goto('/'); await login(other, userA);
    await other.getByRole('button', { name: 'Playlists', exact: true }).click();
    await expect(other.getByRole('heading', { name: 'Tracks in Renamed library', exact: true })).toBeVisible();
    await expect(other.locator('[data-item-id]')).toHaveAttribute('data-item-id', ids[1]);
  } finally { await fresh.close(); }
  // Delay a real A response across logout/login B; release only after B's list is visible.
  let release, received;
  const held = new Promise(resolve => { release = resolve; });
  const captured = new Promise(resolve => { received = resolve; });
  let first = true;
  await page.route('**/api/library/playlists?*', async route => {
    if (!first) return route.continue(); first = false;
    const response = await route.fetch(); received(); await held; await route.fulfill({ response });
  });
  await returnToTab(page); await captured;
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  const userB = await createAccount(page, 'library_b');
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(page.getByText('No playlists yet.', { exact: true })).toBeVisible();
  release(); await page.unrouteAll({ behavior: 'wait' });
  await expect(page.locator('.playlist-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Log out', exact: true }).click(); await login(page, userA);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(rows.first()).toHaveAttribute('data-item-id', ids[1]);
  expect(await page.evaluate(() => localStorage.getItem('ft-music:playlists:v1'))).toBe(witness);
  // Unavailable Catalogue details keep the stored occurrence and its Remove control.
  const trackPattern = '**/api/catalog/tracks/20000000-0000-4000-8000-000000000001';
  await page.route(trackPattern, route => route.fulfill({ status: 404, body: '{}' }));
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(rows.first()).toContainText('Track unavailable');
  await expect(rows.first().getByRole('button', { name: 'Remove track', exact: true })).toBeEnabled();
  await page.unroute(trackPattern); await page.getByRole('button', { name: 'Retry track details', exact: true }).click();
  await page.getByRole('button', { name: 'Play Aube — demo', exact: true }).click(); await expect(page.locator('audio')).toHaveCount(1);
  let deleteCount = 0; page.on('request', r => { if (r.method() === 'DELETE') deleteCount++; });
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Delete playlist', exact: true }).click(); expect(deleteCount).toBe(0);
  await page.route(detailPattern, route => route.request().method() === 'DELETE' ? route.abort() : route.continue());
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Delete playlist', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(page.locator('.playlist-card')).toHaveCount(1); await expect(page.locator('audio')).toHaveCount(1);
  await page.unroute(detailPattern);
  const deletion = page.waitForResponse(r => r.request().method() === 'DELETE' && r.url().endsWith(`/${empty.id}`) && r.status() === 204);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Delete playlist', exact: true }).click(); await deletion;
  await expect(page.locator('.playlist-card')).toHaveCount(0); await expect(page.locator('audio')).toHaveCount(1);
  await page.getByRole('button',{name:'Close audio player',exact:true}).click();
  const relogin = await page.request.post('/api/auth/login', { data: { email: userA.email, password: userA.password } });
  const latestToken = (await relogin.json()).token;
  expect((await page.request.get(`/api/library/playlists/${empty.id}`, { headers: { Authorization: `Bearer ${latestToken}` } })).status()).toBe(404);
  expect(userB.email).not.toBe(userA.email);
  expect(await page.evaluate(() => localStorage.getItem('ft-music:playlists:v1'))).toBe(witness);
});

/** Inscrit un compte de scénario via les formulaires et conserve ses identifiants pour la reconnexion. */
export async function createAccount(page, prefix) {
  const name=`${prefix}_${Date.now().toString(36)}`;
  const user={username:name,email:`${name}@example.test`,password:'MusicTestOnly_123!'};
  await page.goto('/');
  await page.getByLabel('Username',{exact:true}).fill(user.username);
  await page.getByLabel('Display name',{exact:true}).fill('Music Browser');
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill(user.password);
  await page.getByLabel('Confirm password',{exact:true}).fill(user.password);
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Account created',exact:true})).toBeVisible();
  await login(page,user);
  return user;
}

/** Effectue la connexion réelle du compte de scénario et attend sa confirmation. */
export async function login(page,user) {
  await page.getByRole('button',{name:'Login',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill(user.password);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Catalog',exact:true})).toBeVisible();
}

test('media: real decode, playback, seek and recovery', async ({page}) => {
  await createAccount(page,'media');
  await page.getByRole('button',{name:'Catalog',exact:true}).click();
  const first=page.locator('.music-track-row').filter({has:page.getByText('Aube — demo',{exact:true})});
  const second=page.locator('.music-track-row').filter({has:page.getByText('Brise — demo',{exact:true})});
  const received=page.waitForResponse(r=>r.url().endsWith('/api/media/assets/30000000-0000-4000-8000-000000000001/audio') && [200,206].includes(r.status()));
  await first.getByRole('button',{name:'Play Aube — demo',exact:true}).click();
  await received;
  const audio=page.locator('audio');
  await expect.poll(()=>audio.evaluate(a=>a.duration)).toBeCloseTo(6,1);
  // Real play()/seek on the element after the user's Play gesture, no synthetic media events.
  await audio.evaluate(a=>a.play());
  await expect.poll(()=>audio.evaluate(a=>a.currentTime)).toBeGreaterThan(0.3);
  const before=await audio.evaluate(a=>a.currentTime);
  await expect.poll(()=>audio.evaluate(a=>a.currentTime)).toBeGreaterThan(before+0.2);
  await audio.evaluate(a=>{a.currentTime=3;});
  await expect.poll(()=>audio.evaluate(a=>a.currentTime)).toBeGreaterThan(3.3);
  await page.getByRole('button',{name:'Close audio player',exact:true}).click();
  const pattern='**/api/media/assets/30000000-0000-4000-8000-000000000001/audio';
  await page.route(pattern,route=>route.fulfill({status:404,body:'unavailable'}));
  await first.getByRole('button',{name:'Play Aube — demo',exact:true}).click();
  // Un fichier indisponible est sauté ; la file continue sur le morceau suivant.
  await expect(page.getByText('An unavailable track was skipped.', {exact:true})).toBeVisible();
  await expect(second.getByRole('button',{name:'Pause Brise — demo',exact:true})).toBeVisible();
  await expect.poll(()=>audio.evaluate(a=>a.duration)).toBeCloseTo(6,1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.unroute(pattern);
  await page.getByRole('button',{name:'Close audio player',exact:true}).click();
  await first.getByRole('button',{name:'Play Aube — demo',exact:true}).click();
  await expect.poll(()=>audio.evaluate(a=>a.duration)).toBeCloseTo(6,1);
});

test('catalog: three categories, search cancellation and controlled failures',async({page})=>{
  await createAccount(page,'catalog');
  await page.getByRole('button',{name:'Catalog',exact:true}).click();
  for(const name of ['Artists','Projects','Tracks']) await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  const rows=page.locator('.music-track-row');
  await expect(rows).toHaveCount(3);
  const search=page.getByLabel('Search music',{exact:true});
  await search.fill('introuvable');
  await expect(page.getByText('No tracks found.',{exact:true})).toBeVisible();
  await search.fill('aUbE');
  await expect(rows).toHaveCount(1);
  await expect(rows.getByText('Aube — demo',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Tracks',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Artists',exact:true})).toHaveCount(0);
  // Une réponse retardée ne doit jamais remplacer une recherche plus récente.
  let release, started, finished;
  const gate=new Promise(resolve=>{release=resolve;});
  const arrived=new Promise(resolve=>{started=resolve;});
  const completed=new Promise(resolve=>{finished=resolve;});
  const lists='**/api/catalog/tracks?**';
  await page.route(lists,async route=>{
    if(new URL(route.request().url()).searchParams.get('q')!=='Aube'){await route.continue();return;}
    const response=await route.fetch(); started(); await gate;
    try {await route.fulfill({response});} catch { /* ancienne requête annulée */ }
    finally {finished();}
  });
  await search.fill('Aube'); await arrived;
  await search.fill('Brise');
  await expect(rows.getByText('Brise — demo',{exact:true})).toBeVisible();
  release(); await completed;
  await expect(rows).toHaveCount(1);
  await expect(rows.getByText('Brise — demo',{exact:true})).toBeVisible();
  await page.unroute(lists);
  await page.route(lists,route=>route.abort());
  await search.fill('Clair');
  await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
  await page.unroute(lists);
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(rows.getByText('Clair — demo',{exact:true})).toBeVisible();
});

/** Simule le retour sur l’onglet après la fenêtre de fusion focus/visibility. */
async function returnToTab(page) {
  await page.waitForTimeout(550);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}
