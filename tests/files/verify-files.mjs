/** Preuves HTTPS, SQL et disque des audios privés et pochettes sur la pile isolée du runner. */
// Verify file management through HTTPS, PostgreSQL and the real Media volume.
import assert from 'node:assert/strict';
import https from 'node:https';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createFixtures } from './fixtures/create-fixtures.mjs';

/** Racine du dépôt déduite du chemin de ce scénario, indépendante du dossier de lancement. */
export const root = fileURLToPath(new URL('../../', import.meta.url));
/**
 * Origine HTTPS autorisée de la campagne ; les gardes qui suivent empêchent une cible extérieure au
 * périmètre prévu.
 */
export const base = new URL(process.env.FILES_BASE_URL ?? 'https://127.0.0.1:4443');
assert.equal(base.href, 'https://127.0.0.1:4443/');
/** Préfixe Compose unique partagé par les témoins synchrones et le verrou SQL de concurrence. */
const composeArguments=['compose','-p','transcendence_audio_cover','--env-file','/dev/null','-f',`${root}tests/music/compose.yml`,'-f',`${root}tests/files/compose.yml`];
/** Mot de passe public réservé aux comptes jetables de cette campagne ; jamais un secret utilisateur. */
const password = 'Files-test-only-password-2026';
/** Calcule l’empreinte des octets pour comparer original, aperçu et témoins après redémarrage. */
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
/** Exige un UUID avant de le transmettre aux témoins SQL ou disque ; renvoie la valeur validée. */
export const uuid = value => { assert.match(value, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i); return value; };

/**
 * Exécute uniquement la pile audio/pochette isolée, avec entrée facultative et sortie bornée.
 */
export function compose(args, input, maximum = 4 * 1024 * 1024) {
  return execFileSync('docker', [...composeArguments, ...args],
    { cwd: root, input, maxBuffer: maximum, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}
/**
 * Ajoute une garde sur la base isolée et passe les valeurs via les variables psql ; arrête à la
 * première erreur SQL.
 */
export function sql(query, variables = {}) {
  const argumentsList = Object.entries(variables).flatMap(([key, value]) => ['-v', `${key}=${value}`]);
  const guarded = `DO $$ BEGIN IF current_database() <> 'transcendence_music' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;\n${query}`;
  return compose(['exec', '-T', 'db', 'sh', '-c', 'exec psql -X -q -A -t -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 "$@"', 'psql', ...argumentsList], guarded);
}
/**
 * Envoie HTTPS sur l’origine exacte contrôlée ; borne la réponse à 8 MiB et renvoie statut, en-têtes,
 * octets et JSON éventuel.
 */
export function request(path, { method = 'GET', token, json, bytes, contentType } = {}) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'));
  const body = json === undefined ? bytes : Buffer.from(JSON.stringify(json));
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(path, base), { method, rejectUnauthorized: false, headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': contentType ?? 'application/json', 'content-length': body.length } : {}) } }, response => {
      const chunks = []; let length = 0;
      response.on('data', chunk => { length += chunk.length; if (length > 8 * 1024 * 1024) response.destroy(new Error('Response limit exceeded')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => { const payload = Buffer.concat(chunks); resolve({ status: response.statusCode, headers: response.headers, bytes: payload,
        data: String(response.headers['content-type']).includes('application/json') && payload.length ? JSON.parse(payload.toString()) : null }); });
    });
    req.setTimeout(330_000, () => req.destroy(new Error('File HTTP timeout'))); req.on('error', reject); req.end(body);
  });
}
/** Compare le statut au résultat attendu puis renvoie les données JSON pour les autres assertions. */
export function expect(response, status) { assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}`); return response.data; }
/** Attend de façon bornée les services nécessaires via la vraie passerelle HTTPS. */
export async function waitReady() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const responses = await Promise.all(['auth','users','catalog','media','library','playback'].map(service => request(`/api/${service}/ready`))); if (responses.every(response => response.status === 200)) return; } catch { /* bounded startup */ }
    await delay(1000);
  }
  throw new Error('File services did not become ready');
}
/**
 * Attend la confirmation réelle du compte, avec répétitions bornées si l’inscription attend son
 * profil.
 */
export async function login(account) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await request('/api/auth/login', { method: 'POST', json: { email: account.email, password } });
    if (response.status === 202) { await delay(1000); continue; }
    const data = expect(response, 200); assert.equal(typeof data.token, 'string'); return data.token;
  }
  throw new Error('Registration remained pending');
}
/**
 * Crée un compte de campagne avec identité unique puis conserve son UUID confirmé pour les preuves de
 * propriétaire.
 */
export async function createAccount(campaign, suffix) {
  const username = `files_${campaign}_${suffix}`; const email = `${username}@example.invalid`;
  const result = await request('/api/auth/signup', { method: 'POST', json: { username, email, password, displayName: `Files ${suffix}` } });
  assert.ok([201,202].includes(result.status), `Signup failed with ${result.status}`);
  const account = { username, email }; const token = await login(account);
  const profile = expect(await request('/api/users/me', { token }), 200);
  return { ...account, id: uuid(profile.userId) };
}
/**
 * Construit un champ file avec MIME et frontière explicites pour les uploads réels et les refus de
 * contenu.
 */
export function multipart(bytes, mime, field = 'file') {
  assert.ok(field === 'file' || field === 'avatar');
  const boundary = `files-${randomUUID()}`;
  return { contentType: `multipart/form-data; boundary=${boundary}`, bytes: Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="../../untrusted"\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`) ]) };
}
/** Envoie les octets par HTTPS et exige une confirmation 201 avant de renvoyer les métadonnées. */
export async function upload(token, bytes, mime) {
  const file = expect(await request('/api/media/assets', { method: 'POST', token, ...multipart(bytes, mime) }), 201);
  uuid(file.id); assert.equal(file.state, 'ready'); assert.equal(file.usage, 'audio');
  assert.deepEqual(Object.keys(file).filter(key=>key!=='warning').sort(), ['id','usage','state','mimeType','byteSize','durationMs','cover'].sort());
  if(file.cover) uuid(file.cover.id);
  return file;
}
/**
 * Transmet réellement 500 000 001 octets de fichier via un flux de petits blocs, sans allouer 500 Mo ;
 * exige 413 et arrête l’envoi après la réponse.
 */
export async function oversizedAudio(token) {
  const prefix = Buffer.from('--large\r\nContent-Disposition: form-data; name="file"; filename="large.wav"\r\nContent-Type: audio/wav\r\n\r\n');
  const suffix = Buffer.from('\r\n--large--\r\n'); const maximumPlusOne = 500_000_001; const chunk = Buffer.alloc(1024 * 1024);
  const controller = new AbortController(); let status;
  const response = new Promise((resolve, reject) => {
    const req = https.request(new URL('/api/media/assets', base), { method: 'POST', rejectUnauthorized: false, headers: {
      authorization: `Bearer ${token}`, 'content-type': 'multipart/form-data; boundary=large', 'content-length': prefix.length + maximumPlusOne + suffix.length } }, res => {
      status = res.statusCode; res.resume(); res.on('end', () => { resolve(status); controller.abort(); }); res.on('error', reject);
    });
    req.on('error', error => { if (status === undefined) reject(error); });
    req.setTimeout(60_000, () => req.destroy(new Error('Oversized audio timeout')));
    const source = Readable.from((function* () { yield prefix; for (let left = maximumPlusOne; left > 0; left -= Math.min(left,chunk.length)) yield chunk.subarray(0,Math.min(left,chunk.length)); yield suffix; })());
    void pipeline(source, req, { signal: controller.signal }).catch(error => { if (status === undefined) reject(error); });
  });
  assert.equal(await response, 413, '500,000,001 real file bytes must be refused through HTTPS');
}
/** Lit le témoin local de campagne seulement si ses permissions sont 0600. */
export async function readState(path) { assert.equal((await stat(path)).mode & 0o777, 0o600); return JSON.parse(await readFile(path, 'utf8')); }
/**
 * Écrit le témoin de campagne avec permissions privées ; initial permet d’exiger un fichier
 * inexistant.
 */
export async function writeState(path, state, initial = false) { await writeFile(path, JSON.stringify(state, null, 2), { mode: 0o600, ...(initial ? { flag: 'wx' } : {}) }); }

/**
 * Envoie un original, lit son aperçu réel puis mémorise propriétaire, tailles et empreintes comme
 * témoins.
 */
async function recordFile(token, account, bytes, mime) {
  const file = await upload(token, bytes, mime);
  const preview = await request(`/api/media/assets/${file.id}/private-content`, { token }); expect(preview, 200);
  const cover = file.cover ? expectCover(await request(`/api/media/assets/${file.id}/cover`, {token})) : null;
  return { ...file, ownerId: account.id, checksum: sha256(bytes), previewChecksum: sha256(preview.bytes), previewBytes: preview.bytes.length,
    coverChecksum: cover ? sha256(cover.bytes) : null };
}
/** Vérifie une réponse image privée et renvoie ses octets pour les empreintes. */
function expectCover(response) { expect(response,200); assert.equal(response.headers['cache-control'],'no-store'); return response; }
/**
 * Produit de vrais MP3 avec PNG/JPEG intégrés et des pochettes trop larges/corrompues, via FFmpeg et Sharp
 * dans le conteneur de test. Supprime ses temporaires après lecture ; ne touche jamais aux originaux stockés.
 */
export function coverFixtures() {
  const result=compose(['exec','-T','media-service','node','--input-type=module','-e',`
    import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
    import {execFileSync} from 'node:child_process'; import sharp from 'sharp';
    const directory=await mkdtemp('/tmp/cover-fixtures-'); const fixtures={};
    try {
      for(const [name,width,format] of [['png',32,'png'],['jpeg',32,'jpeg'],['wide',8193,'png']]) {
        const image=directory+'/'+name, audio=directory+'/'+name+'.mp3';
        await sharp({create:{width,height:16,channels:3,background:'red'}}).toFormat(format).toFile(image);
        execFileSync('ffmpeg',['-v','error','-i','/data/audio/demo-1.wav','-i',image,'-map','0:a','-map','1:v','-c:a','libmp3lame','-c:v','copy','-disposition:v','attached_pic',audio]);
        fixtures[name+'.mp3']=(await readFile(audio)).toString('base64'); fixtures[name+'.image']=(await readFile(image)).toString('base64');
      }
      const broken=Buffer.from(fixtures['png.mp3'],'base64'), png=Buffer.from(fixtures['png.image'],'base64');
      const offset=broken.indexOf(png), idat=png.indexOf(Buffer.from('IDAT'));
      if(offset<0 || idat<0) throw new Error('Missing artwork'); broken.fill(0,offset+idat+6,offset+idat+14);
      fixtures['broken-cover.mp3']=broken.toString('base64');
      process.stdout.write(JSON.stringify(fixtures));
    } finally {await rm(directory,{recursive:true,force:true});}
  `]);
  return Object.fromEntries(Object.entries(JSON.parse(result)).map(([name,bytes])=>[name,Buffer.from(bytes,'base64')]));
}
/**
 * Compare les métadonnées SQL et les octets sur disque aux témoins. Pour deleted, exige l’absence des
 * originaux et aperçus ainsi que le refus de lecture.
 */
async function verifyStored(file, token, state = 'ready') {
  uuid(file.id); uuid(file.ownerId);
  const assertions = await readFile(new URL('./assert-files.sql', import.meta.url), 'utf8');
  assert.match(sql(assertions, { asset_id: file.id, owner_id: file.ownerId, purpose: file.usage === 'audio' ? 'audio' : 'cover', state,
    bytes: file.byteSize, checksum: file.checksum, duration: file.durationMs ?? 0 }), /FILE_SQL_PASS/);
  if (state === 'deleted') {
    const keys=sql(`SELECT storage_key FROM media.variants WHERE asset_id='${file.id}';`).trim().split('\n').filter(Boolean);
    keys.forEach(key=>assert.match(key,/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/));
    const result = compose(['exec', '-T', 'media-service', 'node', '--input-type=module', '-e',
      'import { lstat } from "node:fs/promises"; const id=process.argv[1]; for (const key of [id+".original",id+".preview.mp3",...JSON.parse(process.argv[2])]) { try { await lstat("/data/audio/"+key); throw new Error("Deleted bytes remain"); } catch(e) { if(e.code!=="ENOENT") throw e; } } console.log("DISK_ABSENT_PASS");', file.id,JSON.stringify(keys)]);
    assert.match(result, /DISK_ABSENT_PASS/); expect(await request(`/api/media/assets/${file.id}/private-content`, { token }), 404); return;
  }
  const result = compose(['exec', '-T', 'media-service', 'node', '--input-type=module', '-e',
    'import { createReadStream } from "node:fs"; import { createHash } from "node:crypto"; const hash=createHash("sha256"); for await(const chunk of createReadStream("/data/audio/"+process.argv[1]+".original")) hash.update(chunk); console.log(hash.digest("hex"));', file.id]);
  assert.equal(result.trim(), file.checksum);
  const response = await request(`/api/media/assets/${file.id}/private-content`, { token }); expect(response, 200);
  assert.equal(sha256(response.bytes), file.previewChecksum); assert.equal(response.bytes.length, file.previewBytes);
  assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.headers['content-type'], file.usage === 'audio' ? 'audio/mpeg' : file.mimeType);
  assert.equal(Number(response.headers['content-length']), file.previewBytes);
  const head = await request(`/api/media/assets/${file.id}/private-content`, { method: 'HEAD', token }); expect(head, 200); assert.equal(head.bytes.length, 0);
  const storedCover=sql(`SELECT id FROM media.variants WHERE asset_id='${file.id}' AND rendition_key='cover';`).trim();
  assert.equal(storedCover,file.cover?.id ?? '');
  const cover=await request(`/api/media/assets/${file.id}/cover`,{token});
  if(file.cover) {
    expectCover(cover); assert.equal(sha256(cover.bytes),file.coverChecksum); assert.equal(cover.headers['content-type'],file.cover.mimeType);
    assert.equal(cover.bytes.length,file.cover.byteSize);
    const headCover=await request(`/api/media/assets/${file.id}/cover`,{method:'HEAD',token}); expect(headCover,200); assert.equal(headCover.bytes.length,0);
  } else expect(cover,404);
}
/**
 * Relit les fichiers des comptes de campagne et les compare aux témoins après les redémarrages, sans
 * les réenvoyer.
 */
async function verify(state) {
  await waitReady(); const tokenA = await login(state.a); const tokenB = await login(state.b);
  const aList = expect(await request('/api/media/assets?pageSize=100', { token: tokenA }), 200).items;
  const aIds = aList.map(file => file.id);
  const bList = expect(await request('/api/media/assets?pageSize=100', { token: tokenB }), 200).items;
  const bIds = bList.map(file => file.id);
  for (const file of state.files) {
    const isA = file.ownerId === state.a.id; assert.ok((isA ? aIds : bIds).includes(file.id)); assert.ok(!(isA ? bIds : aIds).includes(file.id));
    assert.deepEqual((isA ? aList : bList).find(item=>item.id===file.id).cover,file.cover);
    await verifyStored(file, isA ? tokenA : tokenB);
    expect(await request(`/api/media/assets/${file.id}/private-content`, { token: isA ? tokenB : tokenA }), 404);
    expect(await request(`/api/media/assets/${file.id}/cover`, { token: isA ? tokenB : tokenA }), 404);
    expect(await request(`/api/media/assets/${file.id}/cover`, { method:'PUT', token:isA ? tokenB : tokenA, ...multipart(Buffer.from('no'),'image/png') }),404);
    expect(await request(`/api/media/assets/${file.id}/cover`, { method:'DELETE', token:isA ? tokenB : tokenA }),404);
    expect(await request(`/api/media/assets/${file.id}`, { method: 'DELETE', token: isA ? tokenB : tokenA }), 404);
    await verifyStored(file, isA ? tokenA : tokenB);
  }
  if(state.recovery) {
    const {active,unconfirmed,retired}=state.recovery;
    for(const id of [active,unconfirmed,retired]) uuid(id);
    const result=compose(['exec','-T','media-service','node','--input-type=module','-e',
      'import {lstat} from "node:fs/promises"; for(const key of JSON.parse(process.argv[1])) { try {await lstat("/data/audio/"+key); throw new Error("Recovery bytes remain");} catch(error) {if(error.code!=="ENOENT") throw error;} } console.log("RECOVERY_PASS");',
      JSON.stringify([`.cover-${active}`,`.cover-${unconfirmed}`,`${unconfirmed}.cover`,`${retired}.cover`])]);
    assert.match(result,/RECOVERY_PASS/);
    assert.equal(sql(`SELECT count(*) FROM media.variants WHERE storage_key='${retired}.cover';`).trim(),'0');
  }
}
/**
 * Reconstitue trois interruptions connues sur disque : pochette SQL confirmée, installation sans SQL
 * et ancienne pochette retirée. Le prochain redémarrage doit préserver la première et nettoyer les autres.
 */
async function prepareRecovery(state) {
  const file=state.files[1], key=sql(`SELECT storage_key FROM media.variants WHERE id='${uuid(file.cover.id)}';`).trim();
  assert.match(key,/^[a-f0-9-]{36}\.cover$/);
  const active=uuid(key.slice(0,-6)), unconfirmed=randomUUID(), retired=randomUUID();
  compose(['exec','-T','media-service','node','--input-type=module','-e',`
    import {mkdir,writeFile,link} from 'node:fs/promises';
    const [active,unconfirmed,retired]=process.argv.slice(1), root='/data/audio/';
    for(const id of [active,unconfirmed]) await mkdir(root+'.cover-'+id,{mode:0o700});
    await link(root+active+'.cover',root+'.cover-'+active+'/image');
    await writeFile(root+'.cover-'+unconfirmed+'/image','unconfirmed',{flag:'wx'});
    await link(root+'.cover-'+unconfirmed+'/image',root+unconfirmed+'.cover');
    await writeFile(root+retired+'.cover','old image',{flag:'wx'});
  `,active,unconfirmed,retired]);
  sql(`INSERT INTO media.variants(asset_id,rendition_key,storage_key,mime_type,byte_size) VALUES ('${uuid(file.id)}','retired-cover-${retired}','${retired}.cover','image/png',9);`);
  state.recovery={active,unconfirmed,retired}; await writeState(state.path,state);
}
/**
 * Installe des références Catalogue ciblées puis prouve les refus de suppression ; retire ses fixtures
 * dans le nettoyage.
 */
async function references(state) {
  const token = await login(state.a); const audio = state.files[0];
  const ids = { track: randomUUID() };
  state.references = ids; await writeState(state.path, state);
  sql(`INSERT INTO catalog.tracks(id,title,audio_asset_id,duration_ms,status) VALUES ('${uuid(ids.track)}','Files reference fixture','${uuid(audio.id)}',6000,'draft');`);
  try {
    expect(await request(`/api/media/assets/${audio.id}`, { method: 'DELETE', token }), 409); await verifyStored(audio, token);
    const existing = await request('/api/media/assets/30000000-0000-4000-8000-000000000001/audio'); expect(existing, 200); assert.equal(existing.bytes.length, 96044);
    sql(`DO $$ BEGIN IF (SELECT count(*) FROM catalog.tracks WHERE id='${ids.track}' AND audio_asset_id='${audio.id}' AND status='draft')<>1 THEN RAISE EXCEPTION 'Lost catalogue references'; END IF; END $$;`);
  } finally {
    sql(`DELETE FROM catalog.tracks WHERE id='${uuid(ids.track)}';`);
    delete state.references; await writeState(state.path, state);
  }
}
/**
 * Retient la ligne audio dans une vraie transaction PostgreSQL pour faire attendre simultanément
 * un remplacement de pochette et une suppression HTTPS. Relâche toujours le verrou, puis exige une
 * suppression cohérente, aucun ajout tardif et aucun fichier orphelin.
 */
async function concurrentCoverDeletion(state) {
  const token=await login(state.a), fixtures=coverFixtures();
  const before=compose(['exec','-T','media-service','node','--input-type=module','-e',
    'import {readdir} from "node:fs/promises"; console.log(JSON.stringify((await readdir("/data/audio")).sort()));']).trim();
  const file=await recordFile(token,state.a,fixtures['png.mp3'],'audio/mpeg');
  const session=spawn('docker',[...composeArguments,'exec','-T','db','psql','-X','-q','-A','-t','-U','e2e_admin','-d','transcendence_music','-v','ON_ERROR_STOP=1'],{cwd:root,stdio:['pipe','pipe','pipe']});
  let output='', requests;
  /** Attend le témoin imprimé après acquisition du verrou, avec délai et erreur de processus bornés. */
  const locked=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('SQL lock timeout')),10_000);
    session.stdout.on('data',chunk=>{output+=String(chunk); if(output.includes('LOCK_READY')) {clearTimeout(timer); resolve();}});
    session.on('error',error=>{clearTimeout(timer); reject(error);});
    session.on('close',()=>{clearTimeout(timer); reject(new Error('SQL lock closed early'));});
  });
  /** Confirme la fermeture propre de psql sans publier son contenu ni aucune identité de session. */
  const closed=new Promise((resolve,reject)=>{session.on('error',reject); session.on('close',code=>code===0?resolve():reject(new Error('SQL session failed')));});
  void closed.catch(()=>{});
  session.stderr.resume();
  session.stdin.write(`BEGIN; SELECT id FROM media.assets WHERE id='${uuid(file.id)}' FOR UPDATE; SELECT 'LOCK_READY';\n`);
  try {
    await locked;
    requests=Promise.allSettled([
      request(`/api/media/assets/${file.id}/cover`,{method:'PUT',token,...multipart(fixtures['jpeg.image'],'image/jpeg')}),
      request(`/api/media/assets/${file.id}`,{method:'DELETE',token})]);
    let waiting=0;
    for(let attempt=0;attempt<100;attempt++) {
      waiting=Number(sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND usename='media_runtime' AND wait_event_type='Lock';").trim());
      if(waiting>=2) break;
      await delay(50);
    }
    assert.ok(waiting>=2,'Both real writes must be blocked on the audio row');
  } finally {session.stdin.end('COMMIT;\n'); await closed;}
  const [put,removed]=await requests;
  assert.equal(put.status,'fulfilled'); assert.equal(removed.status,'fulfilled');
  assert.ok([200,404].includes(put.value.status)); expect(removed.value,204);
  await verifyStored(file,token,'deleted');
  const after=compose(['exec','-T','media-service','node','--input-type=module','-e',
    'import {readdir} from "node:fs/promises"; console.log(JSON.stringify((await readdir("/data/audio")).sort()));']).trim();
  assert.equal(after,before);
  console.log('[FILES HTTP] PASS concurrent cover/delete blocked together in PostgreSQL; no late cover or orphan bytes');
}
/**
 * Vérifie les parcours existants avatar, catalogue, playlists et écoute avec deux comptes sur la vraie
 * pile.
 */
async function nonRegression(state) {
  const token = await login(state.a); const other = await login(state.b);
  const fixtures = await createFixtures(`${state.path}.fixtures`);
  const profile = expect(await request('/api/users/me/avatar', { method:'POST',token,...multipart(fixtures['image.png'],'image/png','avatar') }),200);
  assert.equal(profile.userId,state.a.id); assert.match(profile.avatarUrl,/^\/api\/users\/avatars\//);
  const avatar = await request(profile.avatarUrl); expect(avatar,200); assert.deepEqual(avatar.bytes,fixtures['image.png']);
  const large = Buffer.alloc(2*1024*1024+1); fixtures['image.png'].copy(large);
  expect(await request('/api/users/me/avatar',{method:'POST',token,...multipart(large,'image/png','avatar')}),413);
  assert.equal(expect(await request('/api/users/me',{token}),200).avatarUrl,profile.avatarUrl);
  const catalog = expect(await request('/api/catalog/tracks'),200); assert.equal(catalog.total,3);
  const trackId = '20000000-0000-4000-8000-000000000001';
  const playlist = expect(await request('/api/library/playlists',{method:'POST',token,json:{name:'Files non-regression fixture',description:''}}),201);
  try {
    const edited = expect(await request(`/api/library/playlists/${uuid(playlist.id)}/items`,{method:'POST',token,json:{trackId,expectedVersion:playlist.version}}),200);
    assert.equal(edited.items.length,1); assert.equal(edited.items[0].trackId,trackId);
    expect(await request(`/api/library/playlists/${playlist.id}`,{token:other}),404);
    expect(await request(`/api/library/playlists/${playlist.id}`,{method:'DELETE',token,json:{expectedVersion:edited.version}}),204);
  } catch(error) {
    const current = await request(`/api/library/playlists/${playlist.id}`,{token});
    if(current.status===200) expect(await request(`/api/library/playlists/${playlist.id}`,{method:'DELETE',token,json:{expectedVersion:current.data.version}}),204);
    throw error;
  }
  const session = expect(await request('/api/playback/sessions',{method:'POST',token,json:{trackId}}),201);
  await delay(250);
  const progress = expect(await request(`/api/playback/sessions/${uuid(session.id)}/progress`,{method:'PUT',token,json:{sequence:1,positionMs:200,listenedMsTotal:200}}),200);
  assert.equal(progress.listenedMs,200); assert.equal(progress.lastSequence,1);
  expect(await request(`/api/playback/sessions/${session.id}/close`,{method:'POST',token:other,json:{}}),404);
  const closed = expect(await request(`/api/playback/sessions/${session.id}/close`,{method:'POST',token,json:{}}),200);
  assert.ok(closed.endedAt); assert.equal(closed.listenedMs,200);
  const history = expect(await request('/api/playback/sessions',{token}),200); assert.ok(history.items.some(item=>item.id===session.id));
  console.log('[FILES HTTP] PASS avatar bytes/limit, catalogue, private Library and Playback non-regression');
}
/**
 * Sélectionne la phase initiale, de relecture, de panne Catalogue, de suppression ou de non-régression
 * et exécute ses assertions réelles.
 */
export async function main(mode, statePath) {
  await waitReady();
  if (mode === 'initial') {
    try { await stat(statePath); throw new Error('State file exists; use a new campaign path'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const campaign = randomUUID().replaceAll('-', '').slice(0, 10); const fixtures = await createFixtures(`${statePath}.fixtures`); const covers=coverFixtures();
    const state = { path: statePath, campaign, a: await createAccount(campaign, 'a'), b: await createAccount(campaign, 'b'), files: [] };
    await writeState(statePath, state, true);
    const tokenA = await login(state.a), tokenB = await login(state.b);
    for (const [token, account, bytes, mime] of [[tokenA,state.a,fixtures['audio.wav'],'audio/wav'], [tokenA,state.a,covers['png.mp3'],'audio/mpeg'],
      [tokenA,state.a,covers['jpeg.mp3'],'audio/mpeg'], [tokenB,state.b,fixtures['audio.wav'],'audio/wav'],
      [tokenA,state.a,covers['wide.mp3'],'audio/mpeg'],[tokenA,state.a,covers['broken-cover.mp3'],'audio/mpeg']]) {
      state.files.push(await recordFile(token, account, bytes, mime)); await writeState(statePath, state);
    }
    assert.equal(state.files[0].cover,null);
    assert.equal(state.files[1].cover.mimeType,'image/png'); assert.equal(state.files[2].cover.mimeType,'image/jpeg');
    for(const file of state.files.slice(4)) { assert.equal(file.cover,null); assert.equal(file.warning,'cover_unavailable'); }
    const audio=state.files[0];
    for(const [bytes,mime] of [[covers['png.image'],'image/png'],[covers['jpeg.image'],'image/jpeg']]) {
      audio.cover=expect(await request(`/api/media/assets/${audio.id}/cover`,{method:'PUT',token:tokenA,...multipart(bytes,mime)}),200).cover;
      audio.coverChecksum=sha256(bytes); await verifyStored(audio,tokenA);
    }
    for(const [bytes,mime,status] of [[fixtures['truncated.png'],'image/png',415],[covers['wide.image'],'image/png',422],[fixtures['false.mp3'],'image/png',415]]) {
      expect(await request(`/api/media/assets/${audio.id}/cover`,{method:'PUT',token:tokenA,...multipart(bytes,mime)}),status); await verifyStored(audio,tokenA);
    }
    expect(await request(`/api/media/assets/${audio.id}/cover`,{method:'DELETE',token:tokenA}),204);
    audio.cover=null; audio.coverChecksum=null; await verifyStored(audio,tokenA);
    // Ajout manuel prioritaire sur le PNG intégré ; les empreintes audio et aperçu restent identiques.
    const embedded=state.files[1];
    embedded.cover=expect(await request(`/api/media/assets/${embedded.id}/cover`,{method:'PUT',token:tokenA,...multipart(covers['jpeg.image'],'image/jpeg')}),200).cover;
    embedded.coverChecksum=sha256(covers['jpeg.image']); await verifyStored(embedded,tokenA); await writeState(statePath,state);
    expect(await request('/api/media/assets'), 401);
    for (const [bytes, mime, status] of [[fixtures['audio.wav'],'image/png',415], [fixtures['truncated.wav'],'audio/wav',415],
      [fixtures['truncated.png'],'image/png',415], [fixtures['empty.wav'],'audio/wav',400], [fixtures['false.mp3'],'audio/mpeg',415], [fixtures['active.svg'],'image/svg+xml',415]]) {
      expect(await request('/api/media/assets', { method: 'POST', token: tokenA, ...multipart(bytes, mime) }), status);
    }
    expect(await request('/api/media/assets', { method: 'POST', token: tokenA, ...multipart(fixtures['image.png'],'image/png') }),415);
    const tooLarge = Buffer.alloc(25_000_001); fixtures['image.png'].copy(tooLarge);
    expect(await request(`/api/media/assets/${audio.id}/cover`, { method: 'PUT', token: tokenA, ...multipart(tooLarge,'image/png') }),413);
    await oversizedAudio(tokenA);
    expect(await request('/api/catalog/internal/assets/30000000-0000-4000-8000-000000000001/references'), 404);
    expect(await request('/api/media/assets/30000000-0000-4000-8000-000000000001', { method: 'DELETE', token: tokenA }), 404);
    await verify(state); await references(state); await concurrentCoverDeletion(state);
    console.log('[FILES HTTP] PASS audio only, embedded PNG/JPEG, optional broken/oversized covers, replace/remove, unchanged originals, owner isolation, SQL/disk and catalogue protection');
    await prepareRecovery(state);
  } else {
    const state = await readState(statePath); assert.equal(state.path, statePath);
    if (mode === 'verify') { await verify(state); console.log('[FILES HTTP] PASS persisted UUIDs, checksums, private covers, owner isolation and SQL/disk recovery'); }
    else if(mode === 'non-regression') await nonRegression(state);
    else if (mode === 'catalog-down') {
      const token = await login(state.a); const file = state.files[0];
      compose(['stop', 'catalog-service']);
      try { expect(await request(`/api/media/assets/${file.id}`, { method: 'DELETE', token }), 503); await verifyStored(file, token); }
      finally { compose(['start', 'catalog-service']); }
      await waitReady(); console.log('[FILES HTTP] PASS catalogue outage refuses deletion and preserves bytes');
    } else if (mode === 'delete') {
      const tokenA = await login(state.a), tokenB = await login(state.b);
      for (const file of state.files.filter(file => file.ownerId === state.a.id)) {
        const responses = await Promise.all([1,2].map(() => request(`/api/media/assets/${file.id}`, { method: 'DELETE', token: tokenA })));
        responses.forEach(response => expect(response, 204)); await verifyStored(file, tokenA, 'deleted');
        expect(await request(`/api/media/assets/${file.id}`, { method: 'DELETE', token: tokenA }), 204);
      }
      for (const file of state.files.filter(file => file.ownerId === state.b.id)) await verifyStored(file, tokenB);
      for (const file of state.files.filter(file => file.ownerId === state.b.id)) { expect(await request(`/api/media/assets/${file.id}`, { method: 'DELETE', token: tokenB }), 204); await verifyStored(file, tokenB, 'deleted'); }
      expect(await request('/api/media/assets/30000000-0000-4000-8000-000000000001/audio'), 200);
      state.deleted = true; await writeState(statePath, state); console.log('[FILES HTTP] PASS concurrent/idempotent deletion, SQL/disk removal and preserved catalogue');
    } else throw new Error('Unknown file scenario mode');
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(process.argv[2] ?? 'initial', process.argv[3] ?? '/tmp/transcendence-files-state.json'); }
  catch (error) { console.error(`[FILES HTTP] FAIL ${error instanceof assert.AssertionError ? error.message : error?.code ?? error?.name ?? 'scenario'}`); process.exitCode = 1; }
}
