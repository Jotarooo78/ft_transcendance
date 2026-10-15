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
