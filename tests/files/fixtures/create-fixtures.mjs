import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Reproducible tiny fixtures; generated files stay local to the campaign.
export async function createFixtures(directory) {
  await mkdir(directory, { recursive: true });
  const samples = 8000 * 6;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let sample = 0; sample < samples; sample++) wav.writeInt16LE(Math.round(2000 * Math.sin(2 * Math.PI * 220 * sample / 8000)), 44 + sample * 2);
  const png = await readFile(new URL('../../e2e/fixtures/avatar.png', import.meta.url));
  const progress = Buffer.alloc(44 + 48000 * 6 * 2); wav.copy(progress, 0, 0, 44);
  progress.writeUInt32LE(progress.length - 8, 4); progress.writeUInt32LE(48000, 24);
  progress.writeUInt32LE(96000, 28); progress.writeUInt32LE(progress.length - 44, 40);
  for (let sample = 0; sample < 48000 * 6; sample++) progress.writeInt16LE(Math.round(2000 * Math.sin(2 * Math.PI * 220 * sample / 48000)), 44 + sample * 2);
  const fixtures = { 'audio.wav': wav, 'image.png': png, 'truncated.wav': wav.subarray(0, 1000),
    'progress.wav': progress,
    'truncated.png': png.subarray(0, Math.floor(png.length / 2)), 'signature.wav': wav.subarray(0, 44),
    'signature.png': png.subarray(0, 8), 'empty.wav': Buffer.alloc(0), 'false.mp3': Buffer.from('not audio'),
    'active.svg': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') };
  for (const [name, bytes] of Object.entries(fixtures)) await writeFile(`${directory}/${name}`, bytes);
  return fixtures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Pass a local campaign fixture directory');
  await createFixtures(process.argv[2]);
}
