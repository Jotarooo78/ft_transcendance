// Recette du chat : rejoue, contre la vraie pile Docker, ce que fera le frontend.
//
// Lancer depuis la racine du dépôt, pile de développement démarrée :
//   node tests/chat/recette.mjs
//   node tests/chat/recette.mjs --with-outage   (coupe puis relance user-service : 503 attendu)
//
// L'adresse se change avec BASE_URL (défaut : https://localhost:1443). Le certificat de la pile est
// auto-signé : le script désactive donc sa vérification, pour ce seul processus.
// Le script crée trois comptes aux noms uniques à chaque lancement ; il n'en supprime aucun.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const base = process.env.BASE_URL ?? 'https://localhost:1443'
const withOutage = process.argv.includes('--with-outage')
const run = Date.now().toString(36)
const password = 'recette-chat-2026'

/** Envoie une requête JSON et renvoie le statut et le corps déjà décodé. */
async function api(method, path, { token, json } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(json ? { 'content-type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

/** Affiche une ligne PASS une fois l'assertion passée ; la première erreur arrête la recette. */
function pass(label) {
  console.log(`PASS  ${label}`)
}

/** Crée un compte, attend la fin de la création du profil (202 tant qu'elle n'est pas faite) et se connecte. */
async function account(name) {
  const username = `${name}_${run}`.slice(0, 24)
  const email = `${username}@recette.invalid`
  const signup = await api('POST', '/api/auth/signup', {
    json: { email, password, username, displayName: name },
  })
  assert.ok([201, 202].includes(signup.status), `signup ${name}: ${signup.status}`)
  for (let attempt = 0; attempt < 15; attempt++) {
    const login = await api('POST', '/api/auth/login', { json: { email, password } })
    if (login.status === 200) {
      const me = await api('GET', '/api/users/me', { token: login.body.token })
      assert.equal(me.status, 200)
      return { name, token: login.body.token, id: me.body.userId }
    }
    await delay(2000)
  }
  throw new Error(`login ${name}: profil jamais créé`)
}

/** Ouvre un WebSocket avec un ticket frais et range les événements reçus dans `events`. */
async function listen(user) {
  const { body } = await api('POST', '/api/chat/ws-ticket', { token: user.token })
  const socket = new WebSocket(`${base.replace('http', 'ws')}/api/chat/ws?ticket=${body.ticket}`)
  const events = []
  socket.addEventListener('message', (event) => events.push(JSON.parse(event.data)))
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('WebSocket refusé')), { once: true })
  })
  return { socket, events, ticket: body.ticket }
}

const alice = await account('alice')
const bob = await account('bob')
const eve = await account('eve')
pass('trois comptes créés et connectés')

const chat = (user, method, path, json) => api(method, `/api/chat${path}`, { token: user.token, json })

assert.equal((await api('GET', '/api/chat/conversations')).status, 401)
pass('sans jeton : 401')

let result = await chat(alice, 'POST', '/conversations', { peerUserId: bob.id })
assert.deepEqual([result.status, result.body.error], [403, 'not_friends'])
pass('avant d’être amis : 403 not_friends')

assert.equal((await api('POST', `/api/users/friends/${bob.id}`, { token: alice.token })).status, 200)
result = await chat(alice, 'POST', '/conversations', { peerUserId: bob.id })
assert.equal(result.status, 201)
const conversationId = result.body.id
assert.equal((await chat(alice, 'POST', '/conversations', { peerUserId: bob.id })).body.id, conversationId)
result = await chat(bob, 'POST', '/conversations', { peerUserId: alice.id })
assert.deepEqual([result.status, result.body.id], [200, conversationId])
pass('ouverture : 201, puis la même conversation pour Alice et pour Bob')

result = await chat(alice, 'POST', '/conversations', { peerUserId: alice.id })
assert.deepEqual([result.status, result.body.error], [400, 'cannot_chat_with_yourself'])
pass('avec soi-même : 400')

const bobSocket = await listen(bob)
const eveSocket = await listen(eve)
result = await chat(alice, 'POST', `/conversations/${conversationId}/messages`, { body: 'Salut Bob 👋' })
assert.equal(result.status, 201)
const first = result.body
await delay(300)
assert.deepEqual(bobSocket.events, [
  { type: 'message.created', conversationId, message: first },
])
assert.deepEqual(eveSocket.events, [])
pass('envoi : Bob reçoit le message en direct, Eve ne reçoit rien')

result = await chat(bob, 'GET', '/conversations')
assert.equal(result.body.items[0].unreadCount, 1)
assert.equal(result.body.items[0].lastMessage.body, 'Salut Bob 👋')
assert.equal((await chat(bob, 'GET', '/unread')).body.total, 1)
pass('Bob voit 1 message non lu')

result = await chat(bob, 'POST', `/conversations/${conversationId}/read`, { upToMessageId: first.id })
assert.deepEqual(result.body, { lastReadMessageId: first.id })
assert.equal((await chat(bob, 'GET', '/unread')).body.total, 0)
pass('marquer comme lu : le compteur tombe à 0')

result = await chat(alice, 'POST', `/conversations/${conversationId}/messages`, { body: '   ' })
assert.deepEqual([result.status, result.body.error], [400, 'invalid_message'])
pass('texte vide : 400 invalid_message')

for (const [user, method, path, json] of [
  [eve, 'GET', `/conversations/${conversationId}/messages`],
  [eve, 'POST', `/conversations/${conversationId}/messages`, { body: 'intrus' }],
]) {
  result = await chat(user, method, path, json)
  assert.deepEqual([result.status, result.body.error], [404, 'conversation_not_found'])
}
pass('une étrangère reçoit 404 (jamais 403)')

result = await chat(bob, 'DELETE', `/conversations/${conversationId}/messages/${first.id}`)
assert.deepEqual([result.status, result.body.error], [404, 'message_not_found'])
result = await chat(alice, 'DELETE', `/conversations/${conversationId}/messages/${first.id}`)
assert.deepEqual([result.status, result.body.body], [200, null])
await delay(300)
assert.equal(bobSocket.events.at(-1).type, 'message.deleted')
pass('suppression : seulement ses messages, et Bob est prévenu en direct')

const reused = new WebSocket(`${base.replace('http', 'ws')}/api/chat/ws?ticket=${bobSocket.ticket}`)
await new Promise((resolve) => reused.addEventListener('error', resolve, { once: true }))
pass('un ticket déjà utilisé est refusé')

const missed = await chat(bob, 'GET', `/conversations/${conversationId}/messages?after=0`)
assert.equal(missed.status, 200)
pass('rattrapage après coupure : ?after= répond 200')

await api('DELETE', `/api/users/friends/${bob.id}`, { token: alice.token })
result = await chat(alice, 'POST', `/conversations/${conversationId}/messages`, { body: 'encore ?' })
assert.deepEqual([result.status, result.body.error], [403, 'not_friends'])
assert.equal((await chat(alice, 'GET', `/conversations/${conversationId}/messages`)).status, 200)
pass('amitié rompue : envoi 403, historique toujours lisible')

if (withOutage) {
  await api('POST', `/api/users/friends/${bob.id}`, { token: alice.token })
  execFileSync('docker', ['compose', 'stop', 'user-service'], { stdio: 'inherit' })
  try {
    result = await chat(alice, 'POST', `/conversations/${conversationId}/messages`, { body: 'panne' })
    assert.deepEqual([result.status, result.body.error], [503, 'chat_unavailable'])
    pass('user-service coupé : 503 chat_unavailable')
  } finally {
    execFileSync('docker', ['compose', 'start', 'user-service'], { stdio: 'inherit' })
  }
}

bobSocket.socket.close()
eveSocket.socket.close()
console.log('\nRecette du chat : tout est passé.')
