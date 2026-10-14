/**
 * @file validate-file.test.ts
 * @brief Tests de la vérification de fichiers, sur de vrais fichiers.
 *
 * @details Ils fabriquent de vraies images et de vrais sons, valides ou volontairement incorrects,
 *   et vérifient la décision rendue. Ils ont besoin de Linux et de ffmpeg.
 */

import { DomainError } from '@ft/service-kit'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { audioByteLimit, imageByteLimit } from '../src/domain/limits.js'
import { demoAudio } from '../src/seed/audio-fixture.js'
import { createFileValidator } from '../src/validation/validate-file.js'

/** @brief Fonction de vérification testée. */
const validate = createFileValidator()

/** @brief Vérifie qu'une vérification échoue avec le statut et le code attendus. */
const rejects = (promise: Promise<unknown>, status: number, code?: string) =>
  assert.rejects(
    promise,
    (error) =>
      error instanceof DomainError && error.status === status && (!code || error.code === code)
  )

/**
 * @brief Exécute un test dans un dossier temporaire, supprimé ensuite.
 * @param prefix Début du nom du dossier.
 * @param run Test à exécuter.
 */
async function inTemporaryDir(prefix: string, run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** @brief Fabrique une image entièrement rouge aux dimensions demandées. */
const redImage = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: 'red' } })

test('real full audio decoding: WAV, FLAC, MP3, AAC/M4A, Ogg and Opus', () =>
  inTemporaryDir('file-audio-', async (dir) => {
    const source = join(dir, 'source.wav')
    const bytes = demoAudio(1)
    await writeFile(source, bytes)
    const wav = await validate(source, 'audio/wav')
    assert.equal(wav.durationMs, 6000)
    assert.equal(wav.byteSize, bytes.length)
    assert.equal(wav.checksumSha256, createHash('sha256').update(bytes).digest('hex'))

    const encodings = [
      ['flac', 'flac', 'audio/flac'],
      ['mp3', 'libmp3lame', 'audio/mpeg'],
      ['aac', 'aac', 'audio/aac'],
      ['m4a', 'aac', 'audio/mp4'],
      ['ogg', 'libvorbis', 'audio/ogg'],
      ['opus', 'libopus', 'audio/opus'],
    ] as const
    for (const [extension, codec, mime] of encodings) {
      const output = join(dir, `audio.${extension}`)
      execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-c:a', codec, output])
      const result = await validate(output, mime)
      assert.equal(result.purpose, 'audio')
      assert.ok(result.durationMs! >= 5900 && result.durationMs! <= 6800, extension)
      await validate(output, 'application/octet-stream')
    }

    await rejects(validate(source, 'image/png'), 415)
    await rejects(validate(source, 'audio/mpeg'), 415, 'mime_mismatch')
    await symlink(source, join(dir, 'link'))
    await rejects(validate(join(dir, 'link'), 'audio/wav'), 503)
  }))

test('PNG/JPEG/WebP decode all pixels and enforce dimensions and animation', () =>
  inTemporaryDir('file-image-', async (dir) => {
    for (const format of ['png', 'jpeg', 'webp'] as const) {
      const path = join(dir, format)
      await redImage(32, 16).toFormat(format).toFile(path)
      const result = await validate(path, `image/${format}`)
      assert.equal(result.purpose, 'image')
      assert.deepEqual([result.width, result.height, result.durationMs], [32, 16, null])
      await rejects(validate(path, 'audio/wav'), 415, 'mime_mismatch')
    }

    const tooWide = join(dir, 'dimensions.png')
    await redImage(8193, 1).png().toFile(tooWide)
    await rejects(validate(tooWide, 'image/png'), 422, 'image_dimensions')
    const tooManyPixels = join(dir, 'pixels.png')
    await redImage(5001, 5000).png().toFile(tooManyPixels)
    await rejects(validate(tooManyPixels, 'image/png'), 422, 'image_dimensions')
    const boundary = join(dir, 'boundary.png')
    await redImage(5000, 5000).png().toFile(boundary)
    await validate(boundary, 'image/png')

    const animated = join(dir, 'animated.webp')
    const frames = Buffer.alloc(2 * 2 * 3 * 2, 127)
    frames.fill(255, 12)
    await sharp(frames, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } })
      .webp()
      .toFile(animated)
    await rejects(validate(animated, 'image/webp'), 415)
  }))

test('empty, oversized, signature-only, corrupt, truncated, active and external-reference files fail', () =>
  inTemporaryDir('file-refusal-', async (dir) => {
    const path = join(dir, 'input')
    const audio = demoAudio(1)
    await writeFile(path, '')
    await rejects(validate(path, 'audio/wav'), 400, 'empty_file')
    await writeFile(path, 'text renamed mp3')
    await rejects(validate(path, 'audio/mpeg'), 415)
    await writeFile(path, audio.subarray(0, 44))
    await rejects(validate(path, 'audio/wav'), 415)
    await writeFile(path, audio.subarray(0, 1000))
    await rejects(validate(path, 'audio/wav'), 415)
    const wrongDuration = demoAudio(1)
    wrongDuration.writeUInt32LE(200_000, 40)
    await writeFile(path, wrongDuration)
    await rejects(validate(path, 'audio/wav'), 415)

    const png = await redImage(8, 8).png().toBuffer()
    await writeFile(path, png.subarray(0, 8))
    await rejects(validate(path, 'image/png'), 415)
    await writeFile(path, png.subarray(0, png.length - 20))
    await rejects(validate(path, 'image/png'), 415)

    const activeOrExternal = [
      "<svg xmlns='http://www.w3.org/2000/svg'/>",
      '<html>test</html>',
      '#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1\nhttp://127.0.0.1/secret\n',
      "ffconcat version 1.0\nfile '/etc/passwd'\n",
    ]
    for (const content of activeOrExternal) {
      await writeFile(path, content)
      await rejects(validate(path, 'application/octet-stream'), 415)
    }

    const sparse = await open(path, 'w')
    await sparse.truncate(audioByteLimit + 1)
    await sparse.close()
    await rejects(validate(path, 'audio/wav'), 413)
    const image = await open(path, 'w')
    await image.write(png.subarray(0, 12))
    await image.truncate(imageByteLimit + 1)
    await image.close()
    await rejects(validate(path, 'image/png'), 413)
  }))

test('budgets stop real workers, cancellation cleans up, and capacity is bounded', () =>
  inTemporaryDir('file-budget-', async (dir) => {
    const path = join(dir, 'audio')
    await writeFile(path, demoAudio(1))
    await rejects(validate(path, 'audio/wav', { timeMs: 1 }), 422, 'processing_limit')
    await rejects(validate(path, 'audio/wav', { memoryBytes: 1 }), 422, 'processing_limit')

    const ongoing = validate(path, 'audio/wav')
    await rejects(validate(path, 'audio/wav'), 503, 'decoder_busy')
    await ongoing

    const controller = new AbortController()
    const aborted = validate(path, 'audio/wav', { signal: controller.signal })
    controller.abort()
    await rejects(aborted, 400, 'upload_aborted')
    await validate(path, 'audio/wav')
  }))
