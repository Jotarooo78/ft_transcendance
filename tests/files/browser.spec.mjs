/** Régressions du formulaire d’envoi avant publication ; la publication complète est vérifiée dans tests/publication. */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createAccount, login as apiLogin, request, expect as status, coverFixtures } from './verify-files.mjs';

/** Mot de passe public des comptes jetables de la campagne. */
const password='Files-test-only-password-2026';
/** Ouvre le formulaire réel sous un compte neuf ; aucune identité de développement. */
async function start(page) {
 const account=await createAccount(randomUUID().replaceAll('-','').slice(0,10),'browser');
 await page.goto('/');await page.getByRole('button',{name:'Login',exact:true}).click();
 await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('button',{name:'Upload',exact:true}).click();return account;
}
/** Retire seulement les audios non publiés créés par ce compte de test. */
async function cleanup(account) {
 const token=await apiLogin(account);const files=status(await request('/api/media/assets?pageSize=100',{token}),200).items;
 for(const file of files)status(await request(`/api/media/assets/${file.id}`,{method:'DELETE',token}),204);
}

test('embedded artwork appears while the title remains editable, then cancel removes the temporary audio',async({page})=>{
 const account=await start(page);
 try {
  const fixtures=coverFixtures();await page.getByLabel('Audio file',{exact:true}).setInputFiles({name:'Embedded.mp3',mimeType:'audio/mpeg',buffer:fixtures['png.mp3']});
  await page.getByLabel('Title',{exact:false}).fill('My title');await expect(page.getByText('✓ Audio ready',{exact:true})).toBeVisible();
  await expect.poll(()=>page.locator('.publish-artwork img').evaluateAll(images=>images.some(i=>i.complete&&i.naturalWidth>0))).toBe(true);
  await expect(page.getByRole('button',{name:'Publish track',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('button',{name:'Choose a file',exact:true})).toBeVisible();
 } finally {await cleanup(account);}
});

test('a bad optional image preserves ready audio and can be removed',async({page})=>{
 const account=await start(page);
 try {
  const fixtures=coverFixtures();await page.getByLabel('Audio file',{exact:true}).setInputFiles({name:'Song.mp3',mimeType:'audio/mpeg',buffer:fixtures['jpeg.mp3']});
  await expect(page.getByText('✓ Audio ready',{exact:true})).toBeVisible();
  await page.getByLabel('Cover image',{exact:true}).setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('broken image')});
  await expect(page.getByRole('button',{name:'Continue without artwork',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish track',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Continue without artwork',exact:true}).click();
  await expect(page.getByRole('button',{name:'Publish track',exact:true})).toBeEnabled();
 } finally {await cleanup(account);}
});

test('an image alone and corrupt audio cannot enable publication',async({page})=>{
 const account=await start(page);
 try {
  const fixtures=coverFixtures();await page.getByLabel('Audio file',{exact:true}).setInputFiles({name:'image.jpg',mimeType:'image/jpeg',buffer:fixtures['jpeg.image']});
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'Publish track',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByLabel('Audio file',{exact:true}).setInputFiles({name:'broken.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('corrupt audio')});
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'Publish track',exact:true})).toBeDisabled();
 } finally {await cleanup(account);}
});

test('session change aborts an active upload and hides the previous form',async({page})=>{
 const account=await start(page);
 try {
  const fixtures=coverFixtures();let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/media/assets?temporary=1',async route=>{await gate;await route.abort().catch(()=>{});});
  await page.getByLabel('Audio file',{exact:true}).setInputFiles({name:'Song.mp3',mimeType:'audio/mpeg',buffer:fixtures['png.mp3']});
  await page.getByRole('button',{name:'Cancel upload',exact:true}).waitFor();
  await page.getByRole('button',{name:'Log out',exact:true}).click();release();
  await expect(page.getByRole('button',{name:'Log in',exact:true})).toBeVisible();await expect(page.getByLabel('Title',{exact:false})).toHaveCount(0);
 } finally {await cleanup(account);}
});

/** Contrôle les événements XHR sans envoyer de fichier : distingue transfert, attente et confirmation serveur. */
test('upload progress becomes animated preparation until the server confirms readiness', async ({ page }) => {
 await page.clock.install();
 // Cette identité reste dans le navigateur ; aucune requête ne touche les comptes ou fichiers réels.
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const data = path === '/api/auth/login' ? { token: 'progress-preview' }
   : path === '/api/users/me' ? { userId: '00000000-0000-4000-8000-000000000001', displayName: 'Preview', username: 'preview', bio: null, avatarUrl: null }
   : { users: [], friends: [], items: [], playlists: [] };
  await route.fulfill({ status: 200, json: data });
 });
 await page.addInitScript(() => {
  /** Garde les autres XHR natifs ; seul le transfert audio reçoit les événements pilotés par le scénario. */
  class ControlledUpload extends XMLHttpRequest {
   /** Repère l’envoi Media sans ouvrir de connexion. */
   open(method, url, ...args) { this.controlled = url.startsWith('/api/media/assets'); if (!this.controlled) super.open(method, url, ...args); }
   /** Ignore l’en-tête uniquement pour l’envoi simulé. */
   setRequestHeader(...args) { if (!this.controlled) super.setRequestHeader(...args); }
   /** Expose le transfert en attente au scénario sans transmettre ses octets. */
   send(body) { if (this.controlled) window.controlledUpload = this; else super.send(body); }
   /** Reproduit la notification d’annulation du navigateur. */
   abort() { if (this.controlled) this.dispatchEvent(new Event('abort')); else super.abort(); }
  }
  window.XMLHttpRequest = ControlledUpload;
 });
 await page.goto('/');
 await page.getByRole('button', { name: 'Login', exact: true }).click();
 await page.getByLabel('Email', { exact: true }).fill('preview@example.invalid');
 await page.getByLabel('Password', { exact: true }).fill('Preview-password');
 await page.getByRole('button', { name: 'Log in', exact: true }).click();
 await page.getByRole('button', { name: 'Upload', exact: true }).click();
 // WAV mono silencieux de deux secondes, valide pour la prévalidation locale.
 const wav = Buffer.alloc(32044);
 wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
 wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
 wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
 wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(32000, 40);
 await page.getByLabel('Audio file', { exact: true }).setInputFiles({ name: 'Wait.wav', mimeType: 'audio/wav', buffer: wav });
 await expect.poll(() => page.evaluate(() => Boolean(window.controlledUpload))).toBe(true);
 await page.evaluate(() => window.controlledUpload.upload.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded: 9999, total: 10000 })));
 await expect(page.getByText('Uploading audio — 99%', { exact: true })).toBeVisible();
 await page.evaluate(() => window.controlledUpload.upload.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded: 10000, total: 10000 })));
 await expect(page.locator('.audio-preparation')).toContainText('Preparing audio');
 await expect(page.getByRole('progressbar')).toHaveCount(0);
 await expect(page.locator('.upload-status')).not.toContainText('100%');
 await expect(page.getByRole('button', { name: 'Publish track', exact: true })).toBeDisabled();
 await page.getByLabel('Title', { exact: false }).fill('Edited during preparation');
 await page.getByLabel('Description', { exact: false }).fill('Still editable');
 await expect(page.getByRole('button', { name: 'Choose artwork', exact: true })).toBeEnabled();
 await expect(page.locator('.preparation-dots')).toHaveCSS('animation-name', 'preparation-dots');
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(page.locator('.preparation-dots')).toHaveCSS('animation-name', 'none');
 await expect(page.getByText(/This is taking a little longer/)).toHaveCount(0);
 await page.clock.fastForward(8000);
 await expect(page.getByText(/This is taking a little longer/)).toBeVisible();
 // Une confirmation valide, et elle seule, rend l’audio publiable.
 await page.evaluate(() => {
  const xhr = window.controlledUpload;
  Object.defineProperty(xhr, 'status', { value: 201 });
  Object.defineProperty(xhr, 'responseText', { value: JSON.stringify({ id: '00000000-0000-4000-8000-000000000002', state: 'ready', usage: 'audio', mimeType: 'audio/wav', byteSize: 32044, durationMs: 2000, cover: null }) });
  xhr.dispatchEvent(new Event('load'));
 });
 await expect(page.getByText('✓ Audio ready', { exact: true })).toBeVisible();
 await expect(page.locator('.audio-preparation')).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Publish track', exact: true })).toBeEnabled();
 // Un nouvel envoi utilise aussi upload.onload si le total n’était pas mesurable, puis reste annulable.
 await page.getByRole('button', { name: 'Upload', exact: true }).click();
 await page.getByRole('button', { name: 'Profile', exact: true }).click();
 await page.getByRole('button', { name: 'Upload', exact: true }).click();
 await page.evaluate(() => { window.controlledUpload = null; });
 await page.getByLabel('Audio file', { exact: true }).setInputFiles({ name: 'Cancel.wav', mimeType: 'audio/wav', buffer: wav });
 await expect.poll(() => page.evaluate(() => Boolean(window.controlledUpload))).toBe(true);
 await page.evaluate(() => window.controlledUpload.upload.dispatchEvent(new Event('load')));
 await expect(page.locator('.audio-preparation')).toBeVisible();
 await page.getByRole('button', { name: 'Cancel upload', exact: true }).click();
 await page.clock.fastForward(8000);
 await expect(page.locator('.audio-preparation')).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Choose a file', exact: true })).toBeVisible();
});
