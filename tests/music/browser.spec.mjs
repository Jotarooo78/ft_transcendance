import { test, expect } from '@playwright/test';

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
  const add = page.getByRole('button', { name: 'Add Aube — demo to playlist', exact: true });
  for (let n = 0; n < 2; n++) {
    const response = page.waitForResponse(r => r.url().endsWith(`/${empty.id}/items`) && r.request().method() === 'POST' && r.status() === 200);
    await add.click(); await response; await expect(add).toBeEnabled();
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
  const fresh = await browser.newContext({ baseURL: 'https://127.0.0.1:3443', ignoreHTTPSErrors: true });
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
  await page.getByRole('button', { name: 'Refresh playlists', exact: true }).click(); await captured;
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
  await expect(rows.first()).toContainText('This track is no longer available.');
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
  await expect(page.locator('.playlist-card')).toHaveCount(0); await expect(page.locator('audio')).toHaveCount(0);
  const relogin = await page.request.post('/api/auth/login', { data: { email: userA.email, password: userA.password } });
  const latestToken = (await relogin.json()).token;
  expect((await page.request.get(`/api/library/playlists/${empty.id}`, { headers: { Authorization: `Bearer ${latestToken}` } })).status()).toBe(404);
  expect(userB.email).not.toBe(userA.email);
  expect(await page.evaluate(() => localStorage.getItem('ft-music:playlists:v1'))).toBe(witness);
});

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
  const first=page.locator('.catalog-track').filter({has:page.getByRole('heading',{name:'Aube — demo',exact:true})});
  const second=page.locator('.catalog-track').filter({has:page.getByRole('heading',{name:'Brise — demo',exact:true})});
  const received=page.waitForResponse(r=>r.url().endsWith('/api/media/assets/30000000-0000-4000-8000-000000000001/audio') && [200,206].includes(r.status()));
  await first.getByRole('button',{name:'Play',exact:true}).click();
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
  await first.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('Audio is unavailable. Close the player and try again.');
  await second.getByRole('button',{name:'Play',exact:true}).click();
  await expect.poll(()=>audio.evaluate(a=>a.duration)).toBeCloseTo(6,1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.unroute(pattern);
  await page.getByRole('button',{name:'Close audio player',exact:true}).click();
  await first.getByRole('button',{name:'Play',exact:true}).click();
  await expect.poll(()=>audio.evaluate(a=>a.duration)).toBeCloseTo(6,1);
});

test('catalog: real lists, filters, detail, cancellation and controlled failures',async({page})=>{
  await createAccount(page,'catalog');
  const firstResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/catalog/tracks' && r.status()===200);
  await page.getByRole('button',{name:'Catalog',exact:true}).click();
  const initial=await (await firstResponse).json();
  expect(initial.total).toBe(3);
  const cards=page.locator('.catalog-track');
  await expect(cards).toHaveCount(2);
  for (const track of initial.items) await expect(cards.getByRole('heading',{name:track.title,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(cards.getByRole('heading',{name:'Clair — demo',exact:true})).toBeVisible();
  for (const sort of ['artist','duration','title']) {
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/catalog/tracks' && new URL(r.url()).searchParams.get('sort')===sort && r.status()===200);
    await page.getByRole('combobox',{name:'Sort by',exact:true}).selectOption(sort);
    const data=await (await response).json(); expect(data.page).toBe(1);
    await expect(cards.getByRole('heading',{name:data.items[0].title,exact:true})).toBeVisible();
  }
  await page.getByRole('combobox',{name:'Genre',exact:true}).selectOption('Demo');
  await expect(page.getByText('3 track(s) found',{exact:true})).toBeVisible();
  const search=page.getByLabel('Search by title, artist, album or genre');
  await search.fill('introuvable');
  await expect(page.getByText('No tracks match your search.',{exact:true})).toBeVisible();
  await search.fill('aUbE');
  await expect(cards).toHaveCount(1);
  const detailButton=page.getByRole('button',{name:'Details for Aube — demo',exact:true});
  await detailButton.focus();
  const detailResponse=page.waitForResponse(r=>r.url().endsWith('/api/catalog/tracks/20000000-0000-4000-8000-000000000001')&&r.status()===200);
  await page.keyboard.press('Enter');
  expect((await (await detailResponse).json()).durationMs).toBe(6000);
  const panel=page.getByRole('region',{name:'Track details',exact:true});
  await expect(panel.getByText('6 seconds',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible(); await expect(detailButton).toBeFocused();

  // Only failure responses are simulated. Recovery always reaches the real server.
  const detailPattern='**/api/catalog/tracks/20000000-0000-4000-8000-000000000001';
  await page.route(detailPattern,route=>route.fulfill({status:404,contentType:'application/json',body:'{"error":"track_not_found"}'}));
  await detailButton.click();
  await expect(panel.getByText('This track is no longer available.',{exact:true})).toBeVisible();
  await expect(cards).toHaveCount(1); await expect(search).toHaveValue('aUbE');
  await page.unroute(detailPattern);
  await panel.getByRole('button',{name:'Retry detail',exact:true}).click();
  await expect(panel.getByText('6 seconds',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Close details',exact:true}).click();

  // Hold a real old response while a newer search completes.
  let release, started, finished;
  const gate=new Promise(resolve=>{release=resolve;});
  const arrived=new Promise(resolve=>{started=resolve;});
  const completed=new Promise(resolve=>{finished=resolve;});
  const lists='**/api/catalog/tracks?**';
  await page.route(lists,async route=>{
    if(new URL(route.request().url()).searchParams.get('q')!=='Aube'){await route.continue();return;}
    const response=await route.fetch(); started(); await gate;
    try {await route.fulfill({response});} catch { /* superseded request was aborted */ }
    finally {finished();}
  });
  await search.fill('Aube'); await arrived;
  await search.fill('Brise');
  await expect(cards.getByRole('heading',{name:'Brise — demo',exact:true})).toBeVisible();
  release(); await completed;
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole('heading',{name:'Brise — demo',exact:true})).toBeVisible();
  await page.unroute(lists);
  await page.route(lists,route=>route.abort());
  await search.fill('Clair');
  await expect(page.getByRole('button',{name:'Retry catalogue',exact:true})).toBeVisible();
  await page.unroute(lists);
  await page.getByRole('button',{name:'Retry catalogue',exact:true}).click();
  await expect(cards.getByRole('heading',{name:'Clair — demo',exact:true})).toBeVisible();
});
