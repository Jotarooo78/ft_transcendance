/** Routes privées sur vrais octets audio/image ; SQL est remplacé par une doublure propriétaire explicitement identifiée. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'
import { buildTestApp, fakeAssets } from './helpers.js'
import { createFileValidator } from '../src/validation/validate-file.js'
import type { AssetsRepository } from '../src/repositories/assets.repository.js'
import { demoAudio } from '../src/seed/audio-fixture.js'
import { DomainError as FileError } from '@ft/service-kit'
import type { StoredFile, CoverVariant as FileVariant } from '../src/domain/file.js'
import type { CoverStore } from '../src/domain/cover.js'

/** Identités de deux comptes de test ; aucune session réelle n’est utilisée. */
const owner = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
/** Construit un corps multipart contenant exactement le fichier fourni. */
function multipart(bytes: Buffer, mime: string) {
  return Buffer.concat([
    Buffer.from(
      `--fixture\r\nContent-Disposition: form-data; name="file"; filename="input"\r\nContent-Type: ${mime}\r\n\r\n`
    ),
    bytes,
    Buffer.from('\r\n--fixture--\r\n'),
  ])
}

test('audio-only uploads extract attached artwork; owned cover replacement/removal keep the audio and refuse third parties', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cover-routes-'))
  const records = new Map<string, Omit<StoredFile, 'variants'> & { variants: FileVariant[] }>()
  /** Exige le propriétaire et l’état disponibles lors de chaque écriture de la doublure SQL. */
  const owned = (id: string, user: string) => {
    const asset = records.get(id)
    if (!asset || asset.uploaderUserId !== user || asset.state !== 'ready')
      throw new FileError(404, 'file_not_found')
    return asset
  }
  const files: Partial<AssetsRepository> = {
    /** Confirme la présence de l’original enregistré pour les reprises d’upload. */
    hasStorageKey: async (key) => [...records.values()].some((asset) => asset.storageKey === key),
    /** Enregistre les valeurs tirées des vrais décodeurs et l’aperçu MP3. */
    create: async (id, uploaderUserId, file, storageKey, previewKey) => {
      const asset = {
        id,
        uploaderUserId,
        purpose: file.purpose,
        state: 'ready',
        storageKey,
        mimeType: file.mimeType,
        byteSize: BigInt(file.byteSize),
        durationMs: BigInt(file.durationMs!),
        checksumSha256: file.checksumSha256,
        variants: [
          {
            id: randomUUID(),
            renditionKey: 'private-preview',
            storageKey: previewKey!,
            mimeType: 'audio/mpeg',
            byteSize: BigInt(file.previewByteSize!),
          },
        ],
      }
      records.set(id, asset)
      return asset
    },
  }
  /** Transforme uniquement la pochette active en trace durable retirée. */
  const detach = (asset: Omit<StoredFile, 'variants'> & { variants: FileVariant[] }) => {
    for (const variant of asset.variants)
      if (variant.renditionKey === 'cover') variant.renditionKey = `retired-cover-${randomUUID()}`
  }
  const covers: CoverStore = {
    /** Associe les octets validés et donne un nouvel identifiant public à la pochette. */
    replace: async (id, user, image, storageKey) => {
      const asset = owned(id, user)
      detach(asset)
      const cover = {
        id: randomUUID(),
        renditionKey: 'cover',
        storageKey,
        mimeType: image.mimeType,
        byteSize: BigInt(image.byteSize),
      }
      asset.variants.push(cover)
      return cover
    },
    /** Retire seulement l’association et conserve la trace de nettoyage. */
    remove: async (id, user) => {
      detach(owned(id, user))
    },
    /** Recherche les clés actives et retirées de la doublure. */
    hasStorageKey: async (key) =>
      [...records.values()].some((asset) =>
        asset.variants.some((variant) => variant.storageKey === key)
      ),
    /** Fournit les variantes retirées pour le vrai nettoyage disque. */
    retired: async (maximum) =>
      [...records.values()]
        .flatMap((asset) =>
          asset.variants.filter((variant) => variant.renditionKey?.startsWith('retired-cover-'))
        )
        .slice(0, maximum),
    /** Confirme la disparition de la trace retirée après l’effacement disque. */
    forgetRetired: async (key) => {
      for (const asset of records.values())
        asset.variants = asset.variants.filter((variant) => variant.storageKey !== key)
    },
  }
  const { app } = await buildTestApp({
    storageDir: directory,
    covers,
    validate: createFileValidator(),
    assets: fakeAssets({
      ...files,
      findOwned: async (user, id) => {
        const asset = records.get(id)
        return asset?.uploaderUserId === user ? asset : null
      },
    }),
    catalog: { isAssetPublished: async () => false, isAssetReferenced: async () => false },
  })
  try {
    await app.ready()
    const headers = {
        authorization: `Bearer ${app.jwt.sign({ sub: owner }, { expiresIn: '1h' })}`,
      },
      foreign = { authorization: `Bearer ${app.jwt.sign({ sub: other }, { expiresIn: '1h' })}` }
    const png = await sharp({ create: { width: 32, height: 16, channels: 3, background: 'red' } })
      .png()
      .toBuffer()
    const wav = join(directory, 'source.wav'),
      image = join(directory, 'source.png'),
      mp3 = join(directory, 'source.mp3')
    await writeFile(wav, demoAudio(1))
    await writeFile(image, png)
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      wav,
      '-i',
      image,
      '-map',
      '0:a',
      '-map',
      '1:v',
      '-c:a',
      'libmp3lame',
      '-c:v',
      'copy',
      '-disposition:v',
      'attached_pic',
      mp3,
    ])
    const original = await readFile(mp3),
      multipartHeaders = { ...headers, 'content-type': 'multipart/form-data; boundary=fixture' }
    const result = await app.inject({
      method: 'POST',
      url: '/assets',
      headers: multipartHeaders,
      payload: multipart(original, 'audio/mpeg'),
    })
    assert.equal(result.statusCode, 201, result.body)
    const data = result.json()
    assert.equal(data.cover.mimeType, 'image/png')
    assert.equal(data.warning, undefined)
    const asset = records.get(data.id)!
    assert.deepEqual(await readFile(join(directory, asset.storageKey)), original)
    const path = `/assets/${asset.id}/cover`
    for (const method of ['GET', 'HEAD'] as const) {
      const response = await app.inject({ method, url: path, headers })
      assert.equal(response.statusCode, 200)
      assert.equal(response.headers['cache-control'], 'no-store')
      assert.deepEqual(response.rawPayload, method === 'GET' ? png : Buffer.alloc(0))
      assert.equal((await app.inject({ method, url: path, headers: foreign })).statusCode, 404)
    }
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/assets',
          headers: multipartHeaders,
          payload: multipart(png, 'image/png'),
        })
      ).statusCode,
      415
    )
    assert.equal(records.size, 1)
    const jpeg = await sharp(png).jpeg().toBuffer()
    const replaced = await app.inject({
      method: 'PUT',
      url: path,
      headers: multipartHeaders,
      payload: multipart(jpeg, 'image/jpeg'),
    })
    assert.equal(replaced.statusCode, 200, replaced.body)
    assert.notEqual(replaced.json().cover.id, data.cover.id)
    assert.deepEqual((await app.inject({ url: path, headers })).rawPayload, jpeg)
    const failed = await app.inject({
      method: 'PUT',
      url: path,
      headers: multipartHeaders,
      payload: multipart(Buffer.from('not an image'), 'image/png'),
    })
    assert.equal(failed.statusCode, 415)
    assert.deepEqual((await app.inject({ url: path, headers })).rawPayload, jpeg)
    for (const method of ['PUT', 'DELETE'] as const)
      assert.equal(
        (
          await app.inject({
            method,
            url: path,
            headers:
              method === 'PUT'
                ? { ...foreign, 'content-type': 'multipart/form-data; boundary=fixture' }
                : foreign,
            ...(method === 'PUT' ? { payload: multipart(png, 'image/png') } : {}),
          })
        ).statusCode,
        404
      )
    assert.equal((await app.inject({ method: 'DELETE', url: path, headers })).statusCode, 204)
    assert.equal((await app.inject({ url: path, headers })).statusCode, 404)
    assert.equal(
      (await app.inject({ url: `/assets/${asset.id}/private-content`, headers })).statusCode,
      200
    )
    assert.deepEqual(await readFile(join(directory, asset.storageKey)), original)
    assert.equal(asset.variants.length, 1)
  } finally {
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
