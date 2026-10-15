/** Preuves HTTPS, PostgreSQL et Chromium de publication, sans données ni compte de développement. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '../files/node_modules/playwright/index.mjs';

/** Origine fixe et projet isolé : ce scénario ne peut pas cibler la pile de développement. */
const base='https://127.0.0.1:4445';
const args=['compose','-p','transcendence_publication','--env-file','/dev/null','-f','tests/music/compose.yml','-f','tests/publication/compose.yml'];
const password='Publication-test-only-password-2026';
/** Exécute exclusivement une commande dans la pile isolée. */
const compose=(command,input)=>execFileSync('docker',[...args,...command],{input,encoding:'utf8',maxBuffer:16*1024*1024});
/** Vérifie le nom de base et interrompt au premier échec SQL. */
const sql=query=>compose(['exec','-T','db','psql','-XAtq','-U','e2e_admin','-d','transcendence_music','-v','ON_ERROR_STOP=1'],`DO $$ BEGIN IF current_database()<>'transcendence_music' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;\n${query}`);
/** Autorise seulement les UUID contrôlés dans les requêtes SQL de preuve. */
const uuid=value=>{assert.match(value,/^[a-f0-9-]{36}$/i);return value;};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({locale: "en-US", ignoreHTTPSErrors:true});
/** Envoie la requête et exige son statut avant de lire son JSON. */
async function api(path,{token,method='GET',data,multipart,status=200}={}) {
 const r=await context.request.fetch(base+path,{method,headers:token?{Authorization:`Bearer ${token}`}:{},data,multipart,timeout:330000});
 assert.equal(r.status(),status,`${method} ${path}: ${r.status()} ${await r.text()}`);
 return status===204?null:r.json();
}
/** Crée un vrai compte Auth/Users, avec attente bornée du provisionnement de profil. */
async function account(suffix) {
 const username=`pub_${randomUUID().replaceAll('-','').slice(0,10)}_${suffix}`,email=`${username}@example.invalid`;
 const r=await context.request.post(base+'/api/auth/signup',{data:{username,email,password,displayName:`Artist ${suffix}`}});assert([201,202].includes(r.status()));
 for(let i=0;i<20;i++) {
  const login=await context.request.post(base+'/api/auth/login',{data:{email,password}});
  if(login.status()===202){await delay(500);continue;}
  assert.equal(login.status(),200);const {token}=await login.json();const profile=await api('/api/users/me',{token});return{...profile,token,email};
 }
 throw Error('Profile provisioning timed out');
}
/** Produit les petits témoins avec les vrais décodeurs présents dans l’image Media. */
function fixtures() {
 return JSON.parse(compose(['exec','-T','media-service','node','--input-type=module'],`
 import sharp from 'sharp'; import {demoAudio} from './dist/seed/audio-fixture.js'; import {writeFile,readFile,rm} from 'node:fs/promises'; import {execFileSync} from 'node:child_process';
 const png=await sharp({create:{width:64,height:64,channels:3,background:'#ff5500'}}).png().toBuffer();
 const wav=demoAudio(2);await writeFile('/tmp/pub.wav',wav);await writeFile('/tmp/pub.png',png);
 execFileSync('ffmpeg',['-v','error','-y','-i','/tmp/pub.wav','-i','/tmp/pub.png','-map','0:a','-map','1:v','-c:a','libmp3lame','-c:v','copy','-disposition:v','attached_pic','/tmp/pub.mp3']);
 console.log(JSON.stringify({wav:wav.toString('base64'),png:png.toString('base64'),mp3:(await readFile('/tmp/pub.mp3')).toString('base64')}));
 await Promise.all(['/tmp/pub.wav','/tmp/pub.png','/tmp/pub.mp3'].map(p=>rm(p)));
 `));
}
/** Transfère un vrai fichier provisoire, sans passer par un simulacre de serveur. */
async function upload(token,bytes,mime='audio/mpeg') {return api('/api/media/assets?temporary=1',{token,method:'POST',multipart:{file:{name:'track',mimeType:mime,buffer:bytes}},status:201});}
/** Connecte le compte dans la vraie interface. */
async function signIn(page,a) {
 await page.goto(base);await page.getByRole('button',{name:'Login',exact:true}).click();
 await page.getByLabel('Email',{exact:true}).fill(a.email);await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('button',{name:'Upload',exact:true}).waitFor();
}
/** Attend un résultat observable en laissant le navigateur traiter ses événements. */
async function until(action) {for(let i=0;i<50;i++){if(await action())return;await delay(200);}throw Error('Observation timed out');}
try {
 const a=await account('a'),b=await account('b');const f=fixtures();
 const mp3=Buffer.from(f.mp3,'base64'),png=Buffer.from(f.png,'base64'),wav=Buffer.from(f.wav,'base64');
 const file=await upload(a.token,mp3);assert(file.cover);
 assert.equal((await context.request.get(base+`/api/media/assets/${file.id}/artwork`)).status(),404);
 assert.equal((await context.request.get(base+`/api/media/assets/${file.id}/audio`)).status(),404);
 assert.equal((await context.request.put(base+`/api/media/internal/assets/${file.id}/publication`,{data:{ownerId:a.userId}})).status(),404);
 const publication={audioAssetId:file.id,title:'Publication with artwork',description:'Credits\nA real upload'};
 await api('/api/catalog/tracks',{method:'POST',data:publication,status:401});
 await api('/api/catalog/tracks',{method:'POST',token:b.token,data:publication,status:409});
 await api('/api/catalog/tracks',{method:'POST',token:a.token,data:{...publication,artistName:'Another artist'},status:400});
 const tracks=await Promise.all([api('/api/catalog/tracks',{method:'POST',token:a.token,data:publication,status:201}),api('/api/catalog/tracks',{method:'POST',token:a.token,data:publication,status:201})]);
 assert.equal(tracks[0].id,tracks[1].id);assert.equal(tracks[0].artistUserId,a.userId);assert.equal(tracks[0].artistName,a.displayName);assert.equal(tracks[0].description,publication.description);
 assert.equal(sql(`SELECT count(*) FROM catalog.tracks WHERE audio_asset_id='${uuid(file.id)}';`).trim(),'1');
 for(const route of ['audio','artwork'])assert.equal((await context.request.get(base+`/api/media/assets/${file.id}/${route}`)).status(),200);
 await api(`/api/media/assets/${file.id}`,{method:'DELETE',token:a.token,status:409});
 const playlist=await api('/api/library/playlists',{method:'POST',token:b.token,data:{name:'Publication playlist',description:''},status:201});
 const added=await api(`/api/library/playlists/${playlist.id}/items`,{method:'POST',token:b.token,data:{trackId:tracks[0].id,expectedVersion:playlist.version},status:200});assert(added.items.some(i=>i.trackId===tracks[0].id));
 await api('/api/users/me/profile',{method:'PUT',token:a.token,data:{displayName:'Renamed Artist',username:a.username,bio:'Artist profile'}});
 assert.equal((await api(`/api/catalog/tracks/${tracks[0].id}`)).artistName,'Renamed Artist');
 const found=await api('/api/catalog/tracks?q=Renamed%20Artist&sort=artist');assert(found.items.some(t=>t.id===tracks[0].id));
 console.log('[PUBLICATION] PASS ownership, duplicate requests, artwork, current artist and second-account playlist');
 // Une réponse HTTP perdue après commit doit retrouver la même publication.
 const retryFile=await upload(a.token,wav,'audio/wav');const retryBody={audioAssetId:retryFile.id,title:'Retry publication',description:''};
 const first=await api('/api/catalog/tracks',{method:'POST',token:a.token,data:retryBody,status:201});
 const second=await api('/api/catalog/tracks',{method:'POST',token:a.token,data:retryBody,status:201});assert.equal(first.id,second.id);
 // Ancien fichier sans expiration, upload abandonné, réservation durable et audio publié.
 const abandoned=await upload(a.token,wav,'audio/wav');
 sql(`UPDATE media.assets SET expires_at=now()-interval '1 hour' WHERE id='${uuid(abandoned.id)}';`);
 compose(['exec','-T','media-service','node','--input-type=module'],`import {createPrisma} from './dist/repositories/prisma.js';import {createPublicationsRepository} from './dist/repositories/publications.repository.js';import {createPublicationsService} from './dist/services/publications.service.js';import {createFileDeletionService} from './dist/services/file-deletion.service.js';import {createAssetsRepository} from './dist/repositories/assets.repository.js';import {createCatalogClient} from './dist/clients/catalog.client.js';const prisma=createPrisma(process.env.MEDIA_DATABASE_URL);try{await createPublicationsService(createPublicationsRepository(prisma),createFileDeletionService({storageDir:'/data/audio',assets:createAssetsRepository(prisma),catalog:createCatalogClient({baseUrl:'http://catalog-service:4002',internalToken:process.env.INTERNAL_SERVICE_TOKEN})})).expire();}finally{await prisma.$disconnect();}`);
 assert.equal(sql(`SELECT state FROM media.assets WHERE id='${uuid(abandoned.id)}';`).trim(),'deleted');
 assert.equal(sql(`SELECT state FROM media.assets WHERE id='${uuid(file.id)}';`).trim(),'ready');
 // Publication contre suppression : leur verrou Media doit empêcher toute publication d’un fichier supprimé.
 const race=await upload(a.token,wav,'audio/wav');
 const [pub,del]=await Promise.all([context.request.post(base+'/api/catalog/tracks',{headers:{Authorization:`Bearer ${a.token}`},data:{audioAssetId:race.id,title:'Race',description:''}}),context.request.delete(base+`/api/media/assets/${race.id}`,{headers:{Authorization:`Bearer ${a.token}`}})]);
 assert([201,409].includes(pub.status()));assert([204,409].includes(del.status()));assert(!(pub.status()===201&&del.status()===204));
 console.log('[PUBLICATION] PASS retry, expiration and publication/deletion race');
 const page=await context.newPage();await signIn(page,a);
 const paths=[['Maladie-Gospel-Version.mp3','/mnt/c/Users/legra/Downloads/Maladie-Gospel-Version.mp3',true],['2025-12-23-le-son-entier-dans-sa-derniere-direction.mp3','/mnt/c/Users/legra/Downloads/2025-12-23-le-son-entier-dans-sa-derniere-direction.mp3',false]];
 for(const [name,path,hasCover] of paths) {
  await page.getByRole('button',{name:'Upload',exact:true}).click();
  let source;try{await access(path);source=path;}catch{source={name,mimeType:hasCover?'audio/mpeg':'audio/wav',buffer:hasCover?mp3:wav};}
  await page.getByLabel('Audio files',{exact:true}).setInputFiles(source);
  await page.getByLabel('Project title',{exact:true}).fill(`Browser ${name}`);await page.getByLabel('Description',{exact:false}).fill('Published from the real browser form.');
  await page.getByText('✓ Ready',{exact:true}).waitFor({timeout:120000});
  if(hasCover)await until(()=>page.locator('.publish-artwork img').evaluateAll(images=>images.some(i=>i.complete&&i.naturalWidth>0)));
  const response=page.waitForResponse(r=>r.url().includes('/api/catalog/me/projects/')&&r.url().endsWith('/publish')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Publish',exact:true}).click();assert.equal((await response).status(),200);
  await page.getByText('Your project is live. Changes saved.',{exact:true}).waitFor();await page.getByRole('button',{name:'View in catalogue',exact:true}).click();
  await page.getByRole('button',{name:'Play project',exact:true}).click();
  await until(()=>page.locator('audio').evaluateAll(audios=>audios.some(a=>a.readyState>=2&&a.duration>0)));
  await page.locator('.music-track-row').getByRole('button',{name:'Renamed Artist',exact:true}).first().click();await page.getByRole('dialog',{name:'Artist profile'}).waitFor();await page.getByRole('heading',{name:'Renamed Artist',exact:true}).waitFor();await page.getByRole('button',{name:'Close profile',exact:true}).click();
  console.log(`[PUBLICATION] PASS real browser upload, publication and playback: ${name}`);
 }
 // Un refus certain ne doit pas enfermer le formulaire dans une reprise impossible.
 await page.getByRole('button',{name:'Upload',exact:true}).click();
 const expiringResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/media/assets'&&r.request().method()==='POST');
 await page.getByLabel('Audio files',{exact:true}).setInputFiles({name:'Expired.mp3',mimeType:'audio/mpeg',buffer:mp3});
 const expiring=await(await expiringResponse).json();await page.getByText('✓ Ready',{exact:true}).waitFor();
 sql(`UPDATE media.assets SET expires_at=now()-interval '1 hour' WHERE id='${uuid(expiring.id)}';`);
 await page.getByRole('button',{name:'Publish',exact:true}).click();await page.locator('.publish-error').waitFor();
 assert(await page.getByLabel('Project title',{exact:true}).isEnabled());await page.getByRole('button',{name:'Remove track 1',exact:true}).click();assert.equal(await page.locator('.upload-track-list li').count(),0);
 console.log('[PUBLICATION] PASS editing and cancellation after a definitive publication refusal');
 // Le périmètre actuel est ordinateur : retrait de pochette et reprise après réponse perdue.
 await page.getByRole('button',{name:'Upload',exact:true}).click();await page.setViewportSize({width:1280,height:900});
 await page.getByLabel('Audio files',{exact:true}).setInputFiles({name:'Mobile.mp3',mimeType:'audio/mpeg',buffer:mp3});
 await page.getByText('✓ Ready',{exact:true}).waitFor();await page.getByRole('button',{name:'Use default artwork',exact:true}).click();
 await page.screenshot({path:'/tmp/publication-default-artwork.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 let dropped=false;
 await page.route('**/api/catalog/me/projects/*/publish',async route=>{if(route.request().method()==='POST'&&!dropped){dropped=true;await route.fetch();await route.abort();}else await route.continue();});
 await page.getByRole('button',{name:'Publish',exact:true}).click();await page.locator('.publish-error').waitFor();
 await page.getByRole('button',{name:'Publish',exact:true}).click();await page.getByText('Your project is live. Changes saved.',{exact:true}).waitFor();
 assert.equal(sql("SELECT count(*) FROM catalog.tracks WHERE title='Mobile';").trim(),'1');
 await page.unroute('**/api/catalog/me/projects/*/publish');
 await page.getByRole('button',{name:'Upload',exact:true}).click();await page.getByRole('button',{name:'Catalog',exact:true}).click();await page.getByRole('button',{name:'Upload',exact:true}).click();
 await page.setViewportSize({width:1280,height:900});
 await page.getByLabel('Audio files',{exact:true}).setInputFiles({name:'Manual.mp3',mimeType:'audio/mpeg',buffer:mp3});
 await page.getByText('✓ Ready',{exact:true}).waitFor();await page.getByLabel('Cover image',{exact:true}).setInputFiles({name:'cover.png',mimeType:'image/png',buffer:png});
 await page.screenshot({path:'/tmp/publication-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Publish',exact:true}).click();await page.getByText('Your project is live. Changes saved.',{exact:true}).waitFor();
 console.log('[PUBLICATION] PASS desktop layout, manual/removable artwork and lost-response retry');
 // Refus réels, sans publication incomplète.
 await api('/api/media/assets?temporary=1',{method:'POST',token:a.token,multipart:{file:{name:'image.png',mimeType:'image/png',buffer:png}},status:415});
 await api('/api/media/assets?temporary=1',{method:'POST',token:a.token,multipart:{file:{name:'broken.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('broken audio')}},status:415});
 compose(['restart','media-service','catalog-service']);
 for(let i=0;i<30;i++){try{await api('/api/media/ready');await api('/api/catalog/ready');break;}catch{if(i===29)throw Error('Restart failed');await delay(500);}}
 assert.equal((await api(`/api/catalog/tracks/${tracks[0].id}`)).artistName,'Renamed Artist');
 assert.equal((await context.request.get(base+tracks[0].audioUrl)).status(),200);
 console.log('[PUBLICATION] PASS corruption rejection and persistence after service restart');
} finally {await browser.close();}
