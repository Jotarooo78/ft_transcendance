# user-service

## Rôle

Service qui expose le profil de l'utilisateur connecté. Ne gère ni le
signup ni le login (c'est `auth-service`) — il consomme le JWT émis par
`auth-service` pour savoir qui fait la requête.

Port interne : `4001`. Routé par nginx sur `/api/users/`.

## Dépendances (`package.json`)

| Dépendance | Rôle |
|---|---|
| `fastify` | Framework HTTP |
| `prom-client` | Métriques Prometheus sur `/metrics` |
| `@fastify/postgres` | Requêtes SQL brutes vers Postgres (`app.pg.query`) — **c'est ce que `index.js` utilise actuellement** |
| `@fastify/jwt` | Vérification locale du JWT (`req.jwtVerify()`), avec le même `JWT_SECRET` qu'`auth-service` |
| `pg` | Driver Postgres bas niveau, utilisé en interne par `@fastify/postgres` |
| `argon2` | Présent mais **non utilisé** dans ce service (le hash du mot de passe se fait dans `auth-service`, pas ici) |
| `@prisma/client`, `@prisma/adapter-pg`, `prisma` (devDependency) | ORM — **non utilisé pour l'instant**, voir "À corriger" |
| `typescript`, `tsx`, `@types/node`, `@types/pg` (devDependencies) | Toolchain TypeScript — **non utilisée pour l'instant**, `index.js` est en JS pur |
| `dotenv` | Chargement de `.env` — présent mais Docker Compose fournit déjà les variables via `env_file`, donc pas strictement nécessaire dans ce contexte |

## Explication de `index.js`

```js
app.register(postgres, { connectionString: process.env.DATABASE_URL });
app.register(jwt, { secret: process.env.JWT_SECRET });
```
Même connexion DB qu'`auth-service`, même secret JWT (obligatoire : c'est
`auth-service` qui signe les tokens, `user-service` doit pouvoir les vérifier
avec la même clé).

### `GET /health`, `GET /metrics`
Identique au pattern d'`auth-service`.

### `GET /me`
```js
onRequest: async (req, reply) => {
  try { await req.jwtVerify(); }
  catch { reply.code(401).send({ error: 'unauthorized' }); }
}
```
- `onRequest` est un hook Fastify qui s'exécute *avant* le handler de la
  route : si le token est absent, invalide ou expiré, la requête est coupée
  ici avec un `401`, le handler principal n'est jamais atteint.
- `req.jwtVerify()` lit le header `Authorization: Bearer <token>`, vérifie la
  signature avec `JWT_SECRET` et l'expiration. **Point important** : cette
  vérification est faite localement, `user-service` n'appelle jamais
  `auth-service` pour valider un token. C'est ce qui permet à `user-service`
  de démarrer et de fonctionner même si `auth-service` est arrêté — exigence
  de `CONVENTIONS.md` ("chaque service doit pouvoir démarrer
  indépendamment").
```js
SELECT id, email, display_name, created_at FROM users WHERE id = $1
```
- `req.user.sub` est l'id extrait du payload du JWT (voir `auth-service.md`
  pour l'explication du champ `sub`).
- Sélection explicite des colonnes (pas de `SELECT *`) : évite de renvoyer
  `password_hash` par erreur si la table évolue plus tard.

## À corriger

1. **Le service a deux façons de parler à Postgres déclarées en même temps** :
   `@fastify/postgres` (SQL brut, ce que `index.js` utilise réellement
   aujourd'hui) et `@prisma/client` + `@prisma/adapter-pg` (ORM, pas encore
   branché). Redondant en l'état. À trancher en équipe — idéalement avec
   Emile puisqu'il gère la DB — entre deux options : rester sur SQL brut
   partout (plus simple à expliquer en soutenance, cohérent avec
   `auth-service`), ou migrer réellement vers Prisma pour les deux services.
   Le entre-deux actuel (dépendances installées, rien d'utilisé) ne sert à
   rien et alourdit l'image Docker pour rien.

2. **Toolchain TypeScript ajoutée mais pas utilisée.** `tsconfig.json` et
   `tsconfig.md` sont présents et bien documentés, mais `tsconfig.md`
   confirme lui-même que "le dossier `src/` n'existe pas encore". Le service
   tourne toujours via `"start": "node index.js"` en JavaScript. Deux
   scénarios propres :
   - Si la migration TypeScript est prévue : créer `src/index.ts` (reprenant
     le contenu actuel), puis changer `"start"` en `"node dist/index.js"`
     comme anticipé dans `tsconfig.md`, et supprimer `index.js` une fois
     `dist/` généré par `npm run build`.
   - Si elle n'est pas prioritaire maintenant : retirer `prisma`,
     `@prisma/client`, `@prisma/adapter-pg`, `typescript`, `tsx`,
     `@types/node`, `@types/pg` de `package.json` jusqu'à ce que quelqu'un
     s'en serve réellement, pour ne pas laisser un état ambigu dans le repo.

