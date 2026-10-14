/**
 * @file upload.test.ts
 * @brief Tests de l'envoi d'un fichier, sur un vrai dossier et avec le vrai décodeur.
 *
 * @details Ils vérifient l'enregistrement d'un fichier valide, les différents refus, la réparation
 *   après un arrêt brutal et l'annulation en cours d'envoi. Ils ont besoin de Linux et de ffmpeg :
 *   on les lance dans l'image Docker du service.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { link, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { demoAudio } from '../src/seed/audio-fixture.js'
import { createUploadService } from '../src/services/upload.service.js'
import { createFileValidator } from '../src/validation/validate-file.js'
import { buildTestApp, memoryStore, owner } from './helpers.js'

/** @brief Vraie fonction de vérification. */
const validate = createFileValidator()
/** @brief Contenu audio d'exemple. */
const bytes = demoAudio(1)
/** @brief Message attendu dans toute réponse de refus d'un envoi. */
const uploadMessage = 'Fichier refusé ou service indisponible. Vérifiez le fichier puis réessayez.'

/**
 * @brief Fabrique à la main le corps d'un formulaire contenant un seul fichier.
 * @param content Contenu du fichier.
 * @param mime Type annoncé.
 * @param extra Parties supplémentaires à ajouter, pour tester les formulaires incorrects.
 * @returns Le corps de la requête.
 */
function multipart(content: Buffer, mime = 'audio/wav', extra = '') {
  const head = `--fixture\r\nContent-Disposition: form-data; name="file"; filename="../../untrusted.wav"\r\nContent-Type: ${mime}\r\n\r\n`
  return Buffer.concat([Buffer.from(head), content, Buffer.from(`\r\n${extra}--fixture--\r\n`)])
}

/** @brief Attend un certain nombre de millisecondes. */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * @brief Attend, une seconde au plus, qu'un dossier devienne vide ou non vide.
 * @param directory Dossier à observer.
 * @param empty Vrai pour attendre qu'il soit vide, faux pour attendre qu'il contienne quelque
 *   chose.
 */
async function waitForDirectory(directory: string, empty: boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (((await readdir(directory)).length === 0) === empty) {
      return
    }
    await wait(10)
  }
}

test('authenticated POST stores the real original and an MP3 preview; owner and paths never come from the form', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'file-post-'))
  const store = memoryStore()
  const { app, bearer } = await buildTestApp({
    storageDir: directory,
    assets: store.assets,
    validate,
  })
  t.after(async () => {
    await app.close()
    await rm(directory, { recursive: true })
  })
  const post = (body: Buffer, authenticated = true) =>
    app.inject({
      method: 'POST',
      url: '/assets',
      headers: {
        'content-type': 'multipart/form-data; boundary=fixture',
        ...(authenticated ? bearer(owner) : {}),
      },
      payload: body,
    })

  assert.equal((await post(multipart(bytes), false)).statusCode, 401)
  assert.equal(store.records.size, 0)

  const created = await post(multipart(bytes))
  assert.equal(created.statusCode, 201, created.body)
  const file = created.json()
  assert.deepEqual(
    { state: file.state, usage: file.usage, durationMs: file.durationMs },
    { state: 'ready', usage: 'audio', durationMs: 6000 }
  )
  assert.equal(file.storageKey, undefined)
  assert.equal(file.uploaderUserId, undefined)
  const asset = store.records.get(file.id)!
  assert.equal(asset.uploaderUserId, owner)
  assert.deepEqual(await readFile(join(directory, asset.storageKey)), bytes)
  assert.equal(asset.checksumSha256, createHash('sha256').update(bytes).digest('hex'))
  const preview = join(directory, store.previews.get(asset.id)!)
  assert.ok((await lstat(preview)).size > 0)
  const probe = ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'json', preview]
  assert.match(execFileSync('ffprobe', probe).toString(), /mp3/)

  const mismatch = await post(multipart(bytes, 'image/png'))
  assert.equal(mismatch.statusCode, 415)
  assert.deepEqual(mismatch.json(), { error: 'unsupported_type', message: uploadMessage })
  assert.equal((await post(multipart(Buffer.alloc(0)))).statusCode, 400)
  assert.equal((await post(multipart(bytes.subarray(0, 1000)))).statusCode, 415)
  const field =
    '--fixture\r\nContent-Disposition: form-data; name="uploaderUserId"\r\n\r\nforged\r\n'
  assert.equal((await post(multipart(bytes, 'audio/wav', field))).statusCode, 400)
  const second =
    '--fixture\r\nContent-Disposition: form-data; name="file"; filename="second.wav"\r\nContent-Type: audio/wav\r\n\r\nnot-audio\r\n'
  assert.equal((await post(multipart(bytes, 'audio/wav', second))).statusCode, 400)
  const notMultipart = await app.inject({
    method: 'POST',
    url: '/assets',
    headers: bearer(owner),
    payload: { file: 'x' },
  })
  assert.equal(notMultipart.statusCode, 400)
  assert.equal(notMultipart.json().error, 'invalid_multipart')
  assert.equal(store.records.size, 1)
  assert.equal((await readdir(directory)).length, 2)

  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: 'blue' } })
    .png()
    .toBuffer()
  const image = await post(multipart(png, 'image/png'))
  assert.equal(image.statusCode, 201, image.body)
  assert.equal(image.json().usage, 'image')
  assert.equal(image.json().durationMs, null)
  const imageAsset = store.records.get(image.json().id)!
  assert.deepEqual(await readFile(join(directory, imageAsset.storageKey)), png)

  const tooLarge = Buffer.alloc(25_000_001)
  png.copy(tooLarge)
  const refused = await post(multipart(tooLarge, 'image/png'))
  assert.equal(refused.statusCode, 413)
  assert.equal(refused.json().error, 'file_too_large')
  assert.equal(store.records.size, 2)
  assert.equal((await readdir(directory)).length, 3)
})

test('an SQL failure is compensated; an uncertain commit keeps its marker until recovery', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'file-sql-'))
  const store = memoryStore()
  t.after(() => rm(directory, { recursive: true }))
  const receive = async (path: string) => {
    await writeFile(path, bytes)
    return 'audio/wav'
  }
  const service = (assets: typeof store.assets) =>
    createUploadService({ storageDir: directory, assets, validate })
  const offline = async (): Promise<never> => {
    throw new Error('database offline')
  }

  const failed = { ...store.assets, create: offline }
  await assert.rejects(service(failed).save(owner, receive))
  assert.deepEqual(await readdir(directory), [])

  const uncertain = { ...failed, hasStorageKey: offline }
  await assert.rejects(service(uncertain).save(owner, receive))
  assert.equal((await readdir(directory)).length, 3)
  await service(store.assets).recover()
  assert.deepEqual(await readdir(directory), [])

  const committed = {
    ...store.assets,
    create: async (...args: Parameters<typeof store.assets.create>) => {
      await store.assets.create(...args)
      throw new Error('lost SQL acknowledgement')
    },
  }
  await assert.rejects(service(committed).save(owner, receive))
  assert.equal(store.records.size, 1)
  assert.equal((await readdir(directory)).length, 2)
  const asset = [...store.records.values()][0]!
  assert.deepEqual(await readFile(join(directory, asset.storageKey)), bytes)
})

test('startup recovery is bounded, leaves seeds and collisions intact, and undoes interrupted publications', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'file-recovery-'))
  const store = memoryStore()
  t.after(() => rm(directory, { recursive: true }))
  const uploads = createUploadService({ storageDir: directory, assets: store.assets, validate })
  await writeFile(join(directory, 'seed.wav'), 'seed')
  const id = '22222222-2222-4222-8222-222222222222'
  const staging = join(directory, `.upload-${id}`)
  const published = join(directory, `${id}.original`)

  await mkdir(staging)
  await writeFile(join(staging, 'original'), bytes)
  await link(join(staging, 'original'), published)
  await assert.rejects(uploads.recover(0))
  assert.equal(await uploads.recover(), 1)
  assert.deepEqual(await readdir(directory), ['seed.wav'])

  await mkdir(staging)
  await writeFile(join(staging, 'original'), 'ours')
  await writeFile(published, 'collision')
  await uploads.recover()
  assert.equal(await readFile(published, 'utf8'), 'collision')
  assert.equal(await readFile(join(directory, 'seed.wav'), 'utf8'), 'seed')
})

test('a real aborted HTTP upload closes the stream and removes its staging file', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'file-abort-'))
  const store = memoryStore()
  const { app, bearer } = await buildTestApp({
    storageDir: directory,
    assets: store.assets,
    validate,
  })
  t.after(async () => {
    await app.close()
    await rm(directory, { recursive: true })
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  assert.ok(address && typeof address !== 'string')

  const upload = request({
    hostname: '127.0.0.1',
    port: address.port,
    path: '/assets',
    method: 'POST',
    headers: {
      ...bearer(owner),
      'content-type': 'multipart/form-data; boundary=fixture',
      'content-length': 1000000,
    },
  })
  upload.on('error', () => undefined)
  upload.write(multipart(bytes).subarray(0, 500))
  await waitForDirectory(directory, false)
  assert.ok((await readdir(directory)).length)
  upload.destroy()
  await waitForDirectory(directory, true)
  assert.deepEqual(await readdir(directory), [])
  assert.equal(store.records.size, 0)
})

test('a second upload is refused while one is being received', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'file-busy-'))
  let release = () => {}
  const slowValidate = () =>
    new Promise<never>((_resolve, reject) => {
      release = () => reject(new Error('stopped'))
    })
  const { app, bearer } = await buildTestApp({
    storageDir: directory,
    assets: memoryStore().assets,
    validate: slowValidate,
  })
  t.after(async () => {
    await app.close()
    await rm(directory, { recursive: true })
  })
  const post = () =>
    app.inject({
      method: 'POST',
      url: '/assets',
      headers: { 'content-type': 'multipart/form-data; boundary=fixture', ...bearer(owner) },
      payload: multipart(bytes),
    })

  const first = post()
  await waitForDirectory(directory, false)
  const second = await post()
  assert.equal(second.statusCode, 503)
  assert.deepEqual(second.json(), {
    error: 'upload_busy',
    message: 'Un envoi est déjà en cours. Réessayez.',
  })
  release()
  assert.equal((await first).statusCode, 503)
})
