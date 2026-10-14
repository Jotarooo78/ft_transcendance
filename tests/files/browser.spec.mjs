/** Preuves Chromium réelles des fichiers : progression réseau, aperçu, suppression, erreurs, annulation et changement de compte. */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createFixtures } from './fixtures/create-fixtures.mjs';
import { createAccount, login as apiLogin, request, expect as status, upload, sql, uuid, compose, coverFixtures } from './verify-files.mjs';

/** Mot de passe public réservé aux comptes jetables de cette campagne ; jamais un secret utilisateur. */
const password = 'Files-test-only-password-2026';
/**
 * Remplit le vrai formulaire du compte et attend la confirmation de connexion avant d’ouvrir ses
 * fichiers.
 */
async function login(page, account) {
  await page.goto('/'); await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(account.email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'My audio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'My audio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My audio', exact: true })).toBeVisible();
}
/**
 * Sélectionne le fichier dans le formulaire et attend la requête réelle d’upload ou sa confirmation
 * selon le scénario.
 */
async function submit(page, bytes, name, mimeType) {
  await page.getByLabel('Audio file').setInputFiles({ name, mimeType, buffer: bytes });
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/media/assets' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add audio', exact: true }).click();
  const result = await response; expect(result.status()).toBe(201); const file = await result.json(); uuid(file.id);
  await expect(page.locator(`[data-file-id="${file.id}"]`)).toBeVisible(); return file;
}
/**
 * Supprime uniquement les fichiers et références identifiés comme fixtures du scénario ; conserve les
 * données étrangères.
 */
async function cleanup(accounts, referenceIds) {
  for (const id of referenceIds) sql(`DELETE FROM catalog.tracks WHERE id='${uuid(id)}';`);
  for (const account of accounts) {
    const token = await apiLogin(account); const files = status(await request('/api/media/assets?pageSize=100', { token }), 200).items;
    for (const file of files) status(await request(`/api/media/assets/${uuid(file.id)}`, { method: 'DELETE', token }), 204);
    expect(status(await request('/api/media/assets', { token }), 200).total).toBe(0);
  }
}

test('real UI: embedded cover, replacement/removal, slow audio, persistence and confirmed deletion', async ({ page }) => {
  const campaign = randomUUID().replaceAll('-', '').slice(0, 10); const path = `/tmp/transcendence-files-browser-${campaign}.json`;
  const a = await createAccount(campaign, 'a'); const b = await createAccount(campaign, 'b'); const references = [];
  const fixtures = await createFixtures(`${path}.fixtures`);
  await writeFile(path, JSON.stringify({ a, b, references }), { mode: 0o600, flag: 'wx' });
  try {
    await login(page, a);
    const covers=coverFixtures();
    const image = await submit(page, covers['png.mp3'], 'embedded.png.mp3', 'audio/mpeg'); const imageRow = page.locator(`[data-file-id="${image.id}"]`);
    await expect.poll(() => imageRow.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await imageRow.getByLabel('Cover image',{exact:true}).setInputFiles({name:'manual.jpg',mimeType:'image/jpeg',buffer:covers['jpeg.image']});
    await imageRow.getByRole('button',{name:'Replace cover',exact:true}).click();
    await expect.poll(()=>imageRow.locator('img').evaluate(image=>image.complete && image.naturalWidth===32)).toBe(true);
    await imageRow.getByRole('button',{name:'Remove cover',exact:true}).click();
    await expect(imageRow.locator('img')).toHaveCount(0); await expect(imageRow.locator('.audio-cover-placeholder')).toBeVisible();
    await imageRow.getByLabel('Cover image',{exact:true}).setInputFiles({name:'manual.png',mimeType:'image/png',buffer:fixtures['image.png']});
    await imageRow.getByRole('button',{name:'Add cover',exact:true}).click();
    await expect(imageRow.locator('img')).toBeVisible();

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 1024 * 1024, uploadThroughput: 128 * 1024 });
    await page.getByLabel('Audio file').setInputFiles({ name: 'progress.wav', mimeType: 'audio/wav', buffer: fixtures['progress.wav'] });
    const sent = page.waitForResponse(response => new URL(response.url()).pathname === '/api/media/assets' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Add audio', exact: true }).click();
    await expect(page.getByRole('progressbar', { name: 'Upload progress' })).toBeVisible();
    const percentages = new Set(); let complete = false; let validationObserved = false;
    const done = sent.then(response => { complete = true; return response; });
    while (!complete) {
      const value = await page.getByRole('progressbar', { name: 'Upload progress' }).evaluateAll(nodes => nodes[0]?.getAttribute('value') ?? null);
      if (value !== null && Number(value) > 0 && Number(value) < 100) percentages.add(Number(value));
      validationObserved ||= await page.getByText('Upload complete. Validating and storing the file on the server…', {exact:true}).isVisible();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const response = await done; expect(response.status()).toBe(201); expect(percentages.size).toBeGreaterThan(1); expect(validationObserved).toBe(true);
    const audio = await response.json(); uuid(audio.id);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const audioRow = page.locator(`[data-file-id="${audio.id}"]`); await expect(audioRow).toBeVisible();
    await audioRow.getByRole('button', { name: 'Open preview', exact: true }).click(); const player = audioRow.locator('audio');
    await expect.poll(() => player.evaluate(audio => Number.isFinite(audio.duration) && audio.duration > 5 && audio.readyState >= 2)).toBe(true);
    await player.click({ position: { x: 20, y: 25 } });
    await expect.poll(() => player.evaluate(audio => audio.currentTime)).toBeGreaterThan(0.2);
    await player.evaluate(audio => audio.pause());
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => /token|file/i.test(key)).length)).toBe(0);

    await page.reload(); await login(page, a);
    await expect(page.locator(`[data-file-id="${image.id}"]`)).toBeVisible(); await expect(page.locator(`[data-file-id="${audio.id}"]`)).toBeVisible();
    const reference = randomUUID(); references.push(reference); await writeFile(path, JSON.stringify({ a,b,references }), { mode: 0o600 });
    sql(`INSERT INTO catalog.tracks(id,title,audio_asset_id,duration_ms,status) VALUES ('${uuid(reference)}','Browser private reference fixture','${uuid(audio.id)}',6000,'draft');`);
    const protectedRow = page.locator(`[data-file-id="${audio.id}"]`);
    await protectedRow.getByRole('button', { name: 'Open preview', exact: true }).click();
    await expect(protectedRow.locator('audio')).toBeVisible();
    await protectedRow.getByRole('button', { name: 'Delete audio', exact: true }).click();
    await expect(protectedRow.getByRole('alert')).toContainText('still used'); await expect(protectedRow.locator('audio')).toBeVisible();
    sql(`DELETE FROM catalog.tracks WHERE id='${uuid(reference)}';`); references.length = 0;

    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await protectedRow.getByRole('button', { name: 'Delete audio', exact: true }).click();
    await expect(protectedRow.getByRole('alert')).toBeVisible(); await expect(protectedRow).toBeVisible();
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await protectedRow.getByRole('button', { name: 'Delete audio', exact: true }).click(); await expect(protectedRow).toHaveCount(0);
    await page.reload(); await login(page, a); await expect(page.locator(`[data-file-id="${audio.id}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-file-id="${image.id}"]`)).toBeVisible();
    await page.getByRole('button', { name: 'Log out', exact: true }).click(); await login(page, b);
    await expect(page.locator('[data-file-id]')).toHaveCount(0); await expect(page.getByText('No files on this page.')).toBeVisible();
  } finally { await cleanup([a,b], references); }
});

test('manual optional cover takes priority; a refused optional cover preserves saved audio', async ({page})=>{
  const campaign=randomUUID().replaceAll('-','').slice(0,10), account=await createAccount(campaign,'a');
  const covers=coverFixtures(), fixtures=await createFixtures(`/tmp/transcendence-files-browser-cover-${campaign}`);
  try {
    await login(page,account);
    await page.getByLabel('Cover image (optional)',{exact:true}).setInputFiles({name:'manual.jpg',mimeType:'image/jpeg',buffer:covers['jpeg.image']});
    const first=await submit(page,covers['png.mp3'],'embedded.mp3','audio/mpeg');
    await expect(page.getByText('Audio and cover saved on the server.',{exact:true})).toBeVisible();
    const token=await apiLogin(account);
    const ready=status(await request('/api/media/assets',{token}),200).items.find(file=>file.id===first.id);
    expect(ready.cover.mimeType).toBe('image/jpeg');
    await page.getByLabel('Cover image (optional)',{exact:true}).setInputFiles({name:'broken.png',mimeType:'image/png',buffer:fixtures['truncated.png']});
    const second=await submit(page,fixtures['audio.wav'],'plain.wav','audio/wav');
    await expect(page.getByRole('alert')).toContainText('Audio saved. The cover was not confirmed:');
    await expect(page.locator(`[data-file-id="${second.id}"]`)).toBeVisible();
    expect(status(await request(`/api/media/assets/${second.id}/private-content`,{token}),200)).toBeNull();
    // Une sélection locale évite de transporter 25 Mo dans le protocole de pilotage de Chromium.
    const large=Buffer.alloc(25_000_001); fixtures['image.png'].copy(large);
    const path=`/tmp/transcendence-files-browser-cover-${campaign}/large.png`; await writeFile(path,large);
    await page.getByLabel('Cover image (optional)',{exact:true}).setInputFiles(path);
    const third=await submit(page,fixtures['audio.wav'],'another.wav','audio/wav');
    await expect(page.getByRole('alert')).toContainText('25 MB');
    await expect(page.locator(`[data-file-id="${third.id}"]`)).toBeVisible();
  } finally {await cleanup([account],[]);}
});

test('real UI and server: local refusal, bypass refusal, cancellation and late owner response', async ({ page }) => {
  const campaign = randomUUID().replaceAll('-', '').slice(0, 10); const a = await createAccount(campaign,'a'); const b = await createAccount(campaign,'b');
  const fixtures = await createFixtures(`/tmp/transcendence-files-browser-negative-${campaign}`); const token = await apiLogin(a);
  try {
    await login(page,a); let uploads = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/media/assets' && request.method() === 'POST') uploads++; });
    for (const [bytes,name,mime] of [[fixtures['image.png'],'standalone.png','image/png'],[fixtures['false.mp3'],'false.mp3','audio/mpeg'],[fixtures['truncated.wav'],'truncated.wav','audio/wav'],[fixtures['truncated.png'],'truncated.png','image/png']]) {
      await page.getByLabel('Audio file').setInputFiles({ name, mimeType: mime, buffer: bytes });
      await page.getByRole('button', { name: 'Add audio', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add audio', exact: true })).toBeEnabled();
    }
    expect(uploads).toBe(0);
    for (const [bytes,mime,expected] of [[fixtures['image.png'],'image/png',415],[fixtures['false.mp3'],'audio/mpeg',415]]) {
      const response = await page.request.post('/api/media/assets', { headers: { Authorization: `Bearer ${token}` }, multipart: { file: { name:'bypass',mimeType:mime,buffer:bytes } } });
      expect(response.status()).toBe(expected);
    }
    const cdp = await page.context().newCDPSession(page); await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline:false,latency:40,downloadThroughput:1024*1024,uploadThroughput:64*1024 });
    await page.getByLabel('Audio file').setInputFiles({ name:'cancel.wav',mimeType:'audio/wav',buffer:fixtures['progress.wav'] });
    await page.getByRole('button',{name:'Add audio',exact:true}).click(); await expect(page.getByRole('progressbar')).toBeVisible();
    await page.getByRole('button',{name:'Cancel upload',exact:true}).click(); await expect(page.getByRole('alert')).toContainText('cancel');
    await cdp.send('Network.emulateNetworkConditions', { offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1 });
    await expect(page.locator('[data-file-id]')).toHaveCount(0);

    const privateFile = await upload(token,fixtures['audio.wav'],'audio/wav');
    // Delay a real authorized A response; never manufacture successful data.
    let release; let arrived; const arrival = new Promise(resolve => { arrived=resolve; }); const gate = new Promise(resolve => { release=resolve; });
    await page.route('**/api/media/assets?page=1&pageSize=20', async route => {
      const response = await route.fetch(); arrived(); await gate; await route.fulfill({ response }).catch(() => {});
    }, { times:1 });
    await page.getByRole('button',{name:'Refresh files',exact:true}).click(); await arrival;
    await page.getByRole('button',{name:'Log out',exact:true}).click(); await login(page,b); release();
    await expect(page.locator(`[data-file-id="${privateFile.id}"]`)).toHaveCount(0); await expect(page.locator('[data-file-id]')).toHaveCount(0);
    await expect(page.getByText('No files on this page.')).toBeVisible();
  } finally { await cleanup([a,b],[]); }
});

test('audio unsupported locally remains uploadable and receives a real playable MP3 preview', async ({ page }) => {
  const campaign = randomUUID().replaceAll('-', '').slice(0,10); const account = await createAccount(campaign,'a');
  const fixture = `/tmp/files-browser-${randomUUID()}.aiff`;
  try {
    compose(['exec','-T','media-service','ffmpeg','-v','error','-i','/data/audio/demo-1.wav','-f','aiff',fixture]);
    const base64 = compose(['exec','-T','media-service','node','--input-type=module','-e','import {readFile} from "node:fs/promises"; process.stdout.write((await readFile(process.argv[1])).toString("base64"));',fixture]);
    const bytes = Buffer.from(base64,'base64'); await login(page,account);
    const local = await page.evaluate(base64 => new Promise(resolve => {
      const audio = new Audio(); const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], {type:'audio/aiff'}));
      /** Libère l’URL et les écouteurs après succès, refus ou délai de décodage local. */
      const finish = value => { clearTimeout(timer); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); resolve(value); };
      const timer = setTimeout(() => finish(false),5000); audio.onloadedmetadata=()=>finish(true); audio.onerror=()=>finish(false); audio.src=url;
    }), base64);
    expect(local).toBe(false);
    const file = await submit(page,bytes,'audio.aiff','audio/aiff'); expect(file.mimeType).toBe('audio/aiff');
    const row = page.locator(`[data-file-id="${file.id}"]`); await row.getByRole('button',{name:'Open preview',exact:true}).click();
    await expect.poll(() => row.locator('audio').evaluate(audio => audio.readyState>=2 && audio.duration>5)).toBe(true);
    await row.locator('audio').click({position:{x:20,y:25}});
    await expect.poll(() => row.locator('audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(.2);
  } finally {
    compose(['exec','-T','media-service','node','--input-type=module','-e','import {unlink} from "node:fs/promises"; await unlink(process.argv[1]);',fixture]);
    await cleanup([account],[]);
  }
});
