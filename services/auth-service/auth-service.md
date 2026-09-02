# auth-service

## Rôle

Service responsable de la création de compte et de la connexion. C'est le
seul service qui manipule le mot de passe en clair (uniquement le temps de
le hasher) et qui émet les JWT que les autres services (ex: user-service)
utilisent ensuite pour authentifier les requêtes.

Port interne : `4000`. Routé par nginx sur `/api/auth/`.

## Dépendances (`package.json`)

| Dépendance | Rôle |
|---|---|
| `fastify` | Framework HTTP du service |
| `prom-client` | Expose les métriques par défaut (CPU, mémoire, event loop) au format Prometheus, sur `/metrics` — prépare le module Prometheus/Grafana |
| `@fastify/postgres` | Plugin officiel Fastify pour interroger PostgreSQL (`app.pg.query(...)`), connecté via `DATABASE_URL` | 
| `@fastify/jwt` | Signature et vérification de JWT (`app.jwt.sign`, `req.jwtVerify`) |
| `argon2` | Hash + salage du mot de passe |

⚠️ Voir la section **À corriger** plus bas : ces trois dernières lignes ne
sont *pas* actuellement dans `package.json`, alors que le code les importe.

## Explication de `index.js`

```js
const app = Fastify({ logger: true });
client.collectDefaultMetrics();
app.register(postgres, { connectionString: process.env.DATABASE_URL });
app.register(jwt, { secret: process.env.JWT_SECRET });
```
Initialisation : le serveur Fastify, la collecte de métriques par défaut, la
connexion Postgres, et le plugin JWT configuré avec le secret partagé (même
valeur que dans `user-service`, sinon les tokens émis ici ne seront pas
reconnus ailleurs).

### `GET /health` et `GET /metrics`
Déjà en place avant l'implémentation de l'auth. `/health` sert au
`docker-compose depends_on: condition: service_healthy` d'un futur service
dépendant, et à un status page. `/metrics` sera scrapé par Prometheus.

### `POST /signup`
```js
if (!email || !password || password.length < 8) { ... 400 ... }
const passwordHash = await argon2.hash(password);
try {
  INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email
} catch (err) {
  if (err.code === '23505') { ... 409 ... }
}
```
- **Pourquoi argon2 plutôt que bcrypt** : recommandation OWASP actuelle
  (résistant aux attaques par GPU), et le salage est géré automatiquement —
  `argon2.hash()` génère un sel aléatoire et l'intègre dans la chaîne
  retournée, donc une seule colonne `password_hash` suffit en base.
- **Pourquoi catcher le code `23505`** plutôt que faire un `SELECT` avant
  l'`INSERT` : un `SELECT` puis `INSERT` laisse une fenêtre de race condition
  entre deux requêtes concurrentes sur le même email (deux comptes créés en
  parallèle passeraient tous les deux le `SELECT` avant que l'un des deux
  `INSERT` n'existe). La contrainte `UNIQUE` en base (voir schéma DB) est la
  seule garantie fiable ; `23505` est le code Postgres standard pour une
  violation de cette contrainte.
- Le hash n'est jamais renvoyé dans la réponse (`RETURNING id, email`
  seulement).

### `POST /login`
```js
SELECT id, password_hash FROM users WHERE email = $1
argon2.verify(rows[0].password_hash, password)
app.jwt.sign({ sub: rows[0].id, email }, { expiresIn: '1h' })
```
- Erreur `401` générique ("invalid credentials") que ce soit parce que
  l'email n'existe pas ou parce que le mot de passe est faux — un message
  différencié permettrait à un attaquant d'énumérer les emails enregistrés.
- `sub` (subject) est le nom de champ JWT standard pour l'identifiant de
  l'utilisateur — convention reprise par `@fastify/jwt` et par `user-service`
  qui lit `req.user.sub`.
- Expiration courte (1h) : limite la fenêtre d'exploitation si un token fuite.
  Pas de refresh token pour l'instant (à ajouter si besoin de sessions plus
  longues).

## À corriger
