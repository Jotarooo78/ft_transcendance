import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const [mode, directory, campaign] = process.argv.slice(2);
assert.ok(directory?.startsWith('/tmp/transcendence-files-'));
assert.match(campaign ?? '', /^transcendence-files-[a-zA-Z0-9]+$/);
const keys = ['db_data','media_data','avatar_data'];
const names = keys.map(key => `common_repo_${campaign.replaceAll('-','_')}_${key}`);
const inspect = (kind, ...values) => JSON.parse(execFileSync('docker',[kind,'inspect',...values],{encoding:'utf8'}));
const expected = Object.fromEntries(keys.map((key,index) => [key, names[index]]));
const mounts = [['ft_db','/var/lib/postgresql/data','db_data'],['ft_media_service','/data/audio','media_data'],['ft_user_service','/data/avatars','avatar_data']];

if(mode === 'prepare') {
  const config = JSON.parse(await readFile(`${directory}/config.json`,'utf8'));
  assert.equal(config.name,'common_repo'); assert.equal(config.services.db.environment.POSTGRES_DB,'transcendence');
  assert.equal(config.services.nginx.ports.find(port=>port.target===443)?.published,'1443');
  const original = Object.fromEntries(keys.map(key=>[key,config.volumes[key].name]));
  for(const key of keys) {
    const volume = inspect('volume',original[key])[0];
    assert.equal(volume.Labels['com.docker.compose.project'],'common_repo'); assert.equal(volume.Labels['com.docker.compose.volume'],key);
  }
  for(const [container,target,key] of mounts) assert.equal(inspect('container',container)[0].Mounts.find(mount=>mount.Destination===target)?.Name,original[key]);
  await writeFile(`${directory}/targets.json`,JSON.stringify({original,expected,campaign}),{mode:0o600,flag:'wx'});
  await writeFile(`${directory}/volumes.yml`,'volumes:\n'+keys.map(key=>`  ${key}:\n    external: true\n    name: ${expected[key]}\n`).join(''),{mode:0o600,flag:'wx'});
  console.log('[FILES] Verified original targets:',Object.values(original).join(', '));
  console.log('[FILES] New disposable targets:',names.join(', '));
} else {
  const targets = JSON.parse(await readFile(`${directory}/targets.json`,'utf8'));
  assert.equal(targets.campaign,campaign); assert.deepEqual(targets.expected,expected);
  if(mode === 'mounted-fresh' || mode === 'mounted-original') {
    for(const [container,target,key] of mounts) assert.equal(inspect('container',container)[0].Mounts.find(mount=>mount.Destination===target)?.Name,(mode==='mounted-fresh'?expected:targets.original)[key]);
    console.log(`[FILES] PASS ${mode}`);
  } else if(mode === 'disposable') {
    for(const [index,key] of keys.entries()) {
      const volume = inspect('volume',names[index])[0];
      assert.equal(volume.Name,expected[key]); assert.equal(volume.Labels['codex.files.campaign'],campaign);
      assert.equal(volume.Labels['codex.files.disposable'],'true'); assert.equal(volume.Labels['com.docker.compose.project'],'common_repo');
      assert.ok(!Object.values(targets.original).includes(volume.Name));
    }
    console.log('[FILES] PASS disposable volume ownership');
  } else if(mode === 'absent') {
    const remaining = execFileSync('docker',['volume','ls','--filter',`label=codex.files.campaign=${campaign}`,'--format','{{.Name}}'],{encoding:'utf8'});
    assert.equal(remaining.trim(),''); console.log('[FILES] PASS disposable volumes removed');
  } else throw new Error('Unknown stack check mode');
}
