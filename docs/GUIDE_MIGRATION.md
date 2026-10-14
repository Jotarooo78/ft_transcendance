# Guide de migration du backend

Réécriture des six services Fastify dans un nouveau dossier `backend/`, un par
un, chacun testé avant le suivant. L'ancien code de `services/` reste en place
jusqu'à la dernière étape, puis il est supprimé.

> **État : migration appliquée.** Les six services sont réécrits dans
> `backend/services/`, Compose pointe dessus et l'ancien dossier `services/` est
> supprimé. Ce guide reste comme trace de la démarche ; l'organisation réelle du
> code est décrite dans [backend/docs/CONVENTIONS.md](../backend/docs/CONVENTIONS.md)
> et [STRUCTURE_SERVICES.md](STRUCTURE_SERVICES.md). Écarts par rapport au plan
> ci-dessous : les noms de quelques fichiers diffèrent des propositions de la
> section 6 ; la limite de débit d'Auth est devenue configurable.

## Comment lire ce guide

Chaque action est annoncée en gras par ce qu'il faut faire :

| Mention | Ce que tu fais |
|---|---|
| **Créer le dossier** | créer un dossier vide |
| **Créer le fichier** | créer le fichier avec **exactement** le contenu du bloc qui suit |
| **Modifier le fichier** | ouvrir un fichier existant et faire le changement décrit |
| **Copier** | copier un fichier ou un dossier existant, sans le modifier |
| **Supprimer** | supprimer le fichier ou le dossier indiqué |
| **Exécuter** | lancer la commande dans un terminal, depuis le dossier indiqué |
| **Résultat attendu** | ce que tu dois voir ; sinon, ne passe pas à la suite |

Tous les chemins partent de la **racine du dépôt** (`ft_transcendance/`).

Ce qui a été vérifié en écrivant ce guide : tous les fichiers de l'étape 0 et du
« service vide » de la section 5 (formatage, typage, compilation, tests,
démarrage). Ce qui ne l'a pas été : tout ce qui demande Docker (images, Compose,
campagnes de `tests/`), le démon étant arrêté lors de la rédaction.

## 1. Principe

| Étape | Service | Port | Preuve à obtenir |
|---|---|---|---|
| 0 | socle | — | tests du gabarit, image Docker du gabarit |
| 1 | catalog | 4002 | `per`, `music catalog` |
| 2 | library | 4004 | `per`, `music library` |
| 3 | playback | 4005 | `per`, `music playback` |
| 4 | media | 4003 | `per`, `music playback`, `files` deux fois |
| 5 | users | 4001 | `per`, `e2e`, `music playback` |
| 6 | auth | 4000 | `per`, `e2e`, `music playback`, `files` |
| 7 | suppression de l'ancien code | — | les quatre suites |

Trois règles tiennent toute la migration :

1. **Le schéma SQL ne change pas.** Chaque nouveau service reprend le dossier
   `prisma/` de l'ancien sans le modifier. Ancien et nouveau service sont donc
   interchangeables sur la même base.
2. **Un service à la fois.** Les cinq autres continuent de tourner, anciens ou
   déjà migrés. La pile fonctionne à chaque étape.
3. **La bascule est un commit isolé.** Elle ne touche que les fichiers Compose.
   Si une campagne échoue, `git revert` de ce commit remet l'ancien service.

Le code est réécrit librement. Ce qui ne change pas, parce que le navigateur,
Nginx, Prometheus et `tests/` en dépendent :

- chemins HTTP, statuts et corps JSON, dont les codes d'erreur ;
- `/health`, `/ready`, `/metrics`, noms et labels des métriques ;
- schémas, tables et rôles PostgreSQL ;
- noms Compose et ports des services.

## 2. Règles d'écriture du nouveau code

À appliquer dans tous les fichiers que tu écris à partir de l'étape 1.

| Règle | Détail |
|---|---|
| Un fichier, un rôle | viser moins de 100 lignes, 150 au maximum |
| Fonctions courtes | une trentaine de lignes au plus ; sinon extraire une fonction nommée |
| Une instruction par ligne | pas de `const a = …; const b = …`, pas de ternaires imbriqués |
| Sorties anticipées | `if (!x) { throw … }` en tête plutôt que des `else` en cascade |
| Nommage des fichiers | `<ressource>.<rôle>.ts` : `playlists.routes.ts`, `playlists.service.ts` |
| Fabriques | `createXService(dépendances)` ; pas de variable globale modifiable dans un module |
| Commentaires | une ligne JSDoc sur ce qui est exporté ; pas un commentaire par champ |
| Erreurs métier | des `DomainError` créées dans `domain/` ; jamais de `catch` qui masque une erreur |
| Formatage | Prettier décide : `npm run format` depuis `backend/` |

Chaque service a les mêmes dossiers, et les imports ne vont que dans un sens :

```
routes → controllers → services → repositories
                          ↓
                        domain
```

| Dossier | Contenu | Peut importer |
|---|---|---|
| `routes/` | URL, garde d'accès, schémas | Fastify, `controllers`, `schemas` |
| `controllers/` | requête → service → DTO | Fastify, `services`, `schemas`, `domain` |
| `schemas/` | validateurs TypeBox et types des DTO | `typebox`, `@ft/service-kit` |
| `services/` | règles métier | `repositories` (types), `clients` (types), `domain` |
| `repositories/` | Prisma et SQL | Prisma, `domain` |
| `clients/` | appels HTTP vers d'autres services | `domain` |
| `domain/` | types métier, fonctions pures, erreurs | `@ft/service-kit` (`DomainError`) |
| `config/` | variables d'environnement | `typebox` |

## 3. Étape 0 — Le socle

Tu vas créer le dossier `backend/` avec un paquet partagé (`@ft/service-kit`) et
un service gabarit (`skeleton-service`). Aucun service réel n'est touché.

### 0.1 Préparer le dépôt

**Exécuter** depuis la racine du dépôt, pour travailler sur une branche dédiée :

```bash
git checkout -b backend-rewrite
```

**Supprimer** le dossier `backend/` s'il existe déjà (l'essai AdonisJS). Il n'est
pas réutilisé :

```bash
rm -rf backend
```

### 0.2 Créer les dossiers

**Exécuter** depuis la racine du dépôt :

```bash
mkdir -p backend/packages/service-kit/src/plugins backend/services/skeleton-service/test
```

```bash
mkdir -p backend/services/skeleton-service/src/config backend/services/skeleton-service/src/routes backend/services/skeleton-service/src/controllers backend/services/skeleton-service/src/schemas backend/services/skeleton-service/src/services backend/services/skeleton-service/src/repositories backend/services/skeleton-service/src/domain
```

### 0.3 Créer les fichiers de la racine de `backend/`

**Créer le fichier `backend/package.json`** — déclare les workspaces npm : un seul `npm install` pour tout le backend.

```json
{
  "name": "ft-backend",
  "private": true,
  "workspaces": [
    "packages/*",
    "services/*"
  ],
  "scripts": {
    "build:packages": "npm run build -w @ft/service-kit",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "devDependencies": {
    "prettier": "^3.9.10"
  }
}
```

**Créer le fichier `backend/tsconfig.base.json`** — options TypeScript strictes, héritées par chaque paquet et service.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmitOnError": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

**Créer le fichier `backend/.prettierrc.json`** — règles de formatage.

```json
{ "printWidth": 100, "singleQuote": true, "semi": false, "trailingComma": "es5" }
```

**Créer le fichier `backend/.prettierignore`** — fichiers que Prettier ne touche pas.

```
node_modules
dist
package-lock.json
**/generated
```

**Créer le fichier `backend/.dockerignore`** — fichiers exclus des images Docker.

```
**/node_modules
**/dist
**/.env
**/src/generated
```

**Modifier le fichier `.gitignore`** (à la racine du dépôt) — ajouter ces lignes
à la fin :

```
# Backend monorepo builds
backend/packages/*/dist/
backend/services/*/dist/
backend/services/*/src/generated/prisma/
```

### 0.4 Créer le paquet `@ft/service-kit`

Ce paquet contient ce que les six services font à l'identique. Onze fichiers.

**Créer le fichier `backend/packages/service-kit/package.json`** — identité et dépendances du paquet. `exports` pointe sur `dist/` : les services importent le JavaScript compilé.

```json
{
  "name": "@ft/service-kit",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch"
  },
  "dependencies": {
    "@fastify/jwt": "^10.2.4",
    "@fastify/type-provider-typebox": "^6.3.0",
    "ajv-formats": "^3.0.1",
    "fastify": "^5.12.1",
    "fastify-plugin": "^6.0.1",
    "prom-client": "^15.1.3",
    "typebox": "^1.3.37"
  },
  "devDependencies": {
    "@types/node": "^22.20.1",
    "typescript": "^7.0.2"
  }
}
```

**Créer le fichier `backend/packages/service-kit/tsconfig.json`** — compile `src/` vers `dist/`.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" },
  "include": ["src/**/*.ts"]
}
```

**Créer le fichier `backend/packages/service-kit/src/domain-error.ts`** — l'erreur métier commune, qui remplace `PlaylistError`, `PlaybackError`, `FileError`…

```ts
/**
 * Refus métier attendu. Le client reçoit `{ error: code, ...details }` avec ce statut :
 * `details` porte les champs publics supplémentaires d'un contrat (`code`, `message`…).
 */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(code)
    this.name = 'DomainError'
  }
}
```

**Créer le fichier `backend/packages/service-kit/src/schemas.ts`** — schémas réutilisés partout : UUID et pagination.

```ts
import { Type, type Static } from 'typebox'

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const positiveIntegerPattern = '^[1-9][0-9]*$'

/** UUID accepté dans une URL ou un corps ; à normaliser en minuscules avant usage. */
export const UuidSchema = Type.String({ pattern: uuidPattern })

/** Pagination reçue en chaînes dans l'URL ; tout autre paramètre est refusé. */
export const PageQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.String({ pattern: positiveIntegerPattern })),
    pageSize: Type.Optional(Type.String({ pattern: positiveIntegerPattern })),
  },
  { additionalProperties: false }
)

export type PageQuery = Static<typeof PageQuerySchema>
export type Pagination = { page: number; pageSize: number }

const defaultPageSize = 20
const maxPageSize = 100

/** Convertit la pagination validée ; renvoie null si elle dépasse les bornes du contrat. */
export function toPagination(query: PageQuery): Pagination | null {
  const page = Number(query.page ?? 1)
  const pageSize = Number(query.pageSize ?? defaultPageSize)
  const offset = (page - 1) * pageSize
  if (pageSize > maxPageSize || !Number.isSafeInteger(offset)) {
    return null
  }
  return { page, pageSize }
}
```

**Créer le fichier `backend/packages/service-kit/src/plugins/metrics.ts`** — mesure la durée de chaque requête, avec les mêmes noms de métriques qu'aujourd'hui.

```ts
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import client from 'prom-client'

declare module 'fastify' {
  interface FastifyInstance {
    /** Registre Prometheus du service, lu par la route /metrics. */
    metrics: client.Registry
  }
  interface FastifyRequest {
    /** Instant de début de requête, pour mesurer sa durée. */
    startedAt: bigint
  }
}

type MetricsOptions = { service: string }

function createDurationHistogram(registry: client.Registry) {
  return new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['service', 'method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [registry],
  })
}

async function metrics(app: FastifyInstance, { service }: MetricsOptions) {
  const registry = new client.Registry()
  const prefix = `${service.replaceAll('-', '_')}_`
  client.collectDefaultMetrics({ prefix, register: registry })
  const duration = createDurationHistogram(registry)

  app.decorate('metrics', registry)
  app.decorateRequest('startedAt', 0n)

  app.addHook('onRequest', async (request) => {
    request.startedAt = process.hrtime.bigint()
  })

  app.addHook('onResponse', async (request, reply) => {
    const seconds = Number(process.hrtime.bigint() - request.startedAt) / 1e9
    const route = request.routeOptions?.url ?? 'unknown'
    duration.labels(service, request.method, route, String(reply.statusCode)).observe(seconds)
  })

  app.addHook('onClose', async () => registry.clear())
}

export const metricsPlugin = fp(metrics, { name: 'ft-metrics' })
```

**Créer le fichier `backend/packages/service-kit/src/plugins/ops.ts`** — les routes `/health`, `/ready` et `/metrics`.

```ts
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

type OpsOptions = {
  service: string
  /** Doit rejeter quand une dépendance du service est indisponible. */
  ready: () => Promise<unknown>
}

async function ops(app: FastifyInstance, { service, ready }: OpsOptions) {
  app.get('/health', async () => ({ status: 'ok', service }))

  app.get('/ready', async (_request, reply) => {
    try {
      await ready()
      return { status: 'ready', service }
    } catch {
      return reply.code(503).send({ status: 'not-ready', service })
    }
  })

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', app.metrics.contentType)
    return app.metrics.metrics()
  })
}

export const opsPlugin = fp(ops, { name: 'ft-ops', dependencies: ['ft-metrics'] })
```

**Créer le fichier `backend/packages/service-kit/src/plugins/errors.ts`** — un seul endroit qui transforme une erreur en réponse HTTP.

```ts
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { DomainError } from '../domain-error.js'

export type FallbackError = { status: number; code: string }
type ErrorsOptions = { fallback: FallbackError }

function isClientError(error: FastifyError): boolean {
  const status = error.statusCode ?? 500
  return status >= 400 && status < 500
}

async function errors(app: FastifyInstance, { fallback }: ErrorsOptions) {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof DomainError) {
      return reply.code(error.status).send({ error: error.code, ...error.details })
    }
    if (error.validation || isClientError(error)) {
      return reply.code(error.statusCode ?? 400).send({ error: 'invalid_request' })
    }
    request.log.error({ err: error }, 'unhandled error')
    return reply.code(fallback.status).send({ error: fallback.code })
  })
}

export const errorsPlugin = fp(errors, { name: 'ft-errors' })
```

**Créer le fichier `backend/packages/service-kit/src/plugins/auth.ts`** — vérifie le JWT et fournit `app.authenticate`, qui renseigne `request.userId`.

```ts
import jwt from '@fastify/jwt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    /** À poser en onRequest sur une route privée : vérifie le JWT et renseigne request.userId. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    /** UUID du compte, issu du JWT vérifié ; vide tant que authenticate n'a pas réussi. */
    userId: string
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub?: unknown; exp?: unknown; [claim: string]: unknown }
    user: { sub?: unknown; exp?: unknown; [claim: string]: unknown }
  }
}

type AuthOptions = { secret: string }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readSubject(user: { sub?: unknown; exp?: unknown }): string | null {
  const { sub, exp } = user
  const isExpired = typeof exp !== 'number' || exp <= Date.now() / 1000
  if (typeof sub !== 'string' || !uuidPattern.test(sub) || isExpired) {
    return null
  }
  return sub.toLowerCase()
}

function refuse(request: FastifyRequest, reply: FastifyReply) {
  const body = request.method === 'HEAD' ? undefined : { error: 'unauthorized' }
  return reply.code(401).send(body)
}

async function auth(app: FastifyInstance, { secret }: AuthOptions) {
  if (!secret.trim()) {
    throw new Error('JWT_SECRET is required')
  }
  await app.register(jwt, { secret, verify: { algorithms: ['HS256'] } })
  app.decorateRequest('userId', '')

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store')
    try {
      await request.jwtVerify()
    } catch {
      return refuse(request, reply)
    }
    const subject = readSubject(request.user)
    if (subject === null) {
      return refuse(request, reply)
    }
    request.userId = subject
  })
}

export const authPlugin = fp(auth, { name: 'ft-auth' })

/** Réexporté pour que les services voient app.jwt et request.jwtVerify sans dépendre du plugin. */
export type { JWT } from '@fastify/jwt'
```

**Créer le fichier `backend/packages/service-kit/src/plugins/internal-token.ts`** — fournit `app.requireInternalToken` pour les routes `/internal`.

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { timingSafeEqual } from 'node:crypto'

declare module 'fastify' {
  interface FastifyInstance {
    /** À poser en onRequest sur une route /internal : exige le secret partagé entre services. */
    requireInternalToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

type InternalTokenOptions = { token: string }

function matches(authorization: string | undefined, token: string): boolean {
  const received = Buffer.from(authorization ?? '')
  const expected = Buffer.from(`Bearer ${token}`)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

async function internalToken(app: FastifyInstance, { token }: InternalTokenOptions) {
  if (!token.trim()) {
    throw new Error('INTERNAL_SERVICE_TOKEN is required')
  }
  app.decorate('requireInternalToken', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store')
    if (!matches(request.headers.authorization, token)) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
  })
}

export const internalTokenPlugin = fp(internalToken, { name: 'ft-internal-token' })
```

**Créer le fichier `backend/packages/service-kit/src/create-app.ts`** — crée l'instance Fastify commune. La validation y est réglée en mode strict : Fastify convertit les types et retire les champs inconnus par défaut, alors que les contrats actuels les refusent.

```ts
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import Fastify from 'fastify'
import { errorsPlugin, type FallbackError } from './plugins/errors.js'
import { metricsPlugin } from './plugins/metrics.js'

export type CreateAppOptions = {
  /** Nom du service, repris dans les métriques et les routes d'exploitation. */
  service: string
  /** Réponse renvoyée pour une erreur imprévue, propre à chaque service. */
  fallback: FallbackError
  logger?: boolean
}

/**
 * Validation stricte : aucun type n'est converti et un champ inconnu est refusé,
 * alors que Fastify convertit et retire ces champs par défaut.
 */
const strictValidation = {
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
} as const

/** Instance Fastify commune aux services : validation stricte, métriques et format d'erreur. */
export function createApp({ service, fallback, logger = true }: CreateAppOptions) {
  const app = Fastify({
    logger,
    ajv: { customOptions: strictValidation },
  }).withTypeProvider<TypeBoxTypeProvider>()

  app.register(metricsPlugin, { service })
  app.register(errorsPlugin, { fallback })
  return app
}

export type App = ReturnType<typeof createApp>
```

**Créer le fichier `backend/packages/service-kit/src/index.ts`** — la liste de ce que le paquet expose aux services.

```ts
export { createApp, type App, type CreateAppOptions } from './create-app.js'
export { DomainError } from './domain-error.js'
export { authPlugin, type JWT } from './plugins/auth.js'
export { errorsPlugin, type FallbackError } from './plugins/errors.js'
export { internalTokenPlugin } from './plugins/internal-token.js'
export { metricsPlugin } from './plugins/metrics.js'
export { opsPlugin } from './plugins/ops.js'
export {
  PageQuerySchema,
  UuidSchema,
  toPagination,
  type PageQuery,
  type Pagination,
} from './schemas.js'
```

### 0.5 Créer le service gabarit `skeleton-service`

Il expose une ressource d'exemple, `notes`, stockée en mémoire. Elle montre le
chemin complet d'une requête à travers les couches. Quatorze fichiers.

**Créer le fichier `backend/services/skeleton-service/package.json`** — identité, scripts et dépendances du service.

```json
{
  "name": "@ft/skeleton-service",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "engines": {
    "node": "22.x"
  },
  "scripts": {
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.test.json --noEmit",
    "test": "tsx --test \"test/*.test.ts\""
  },
  "dependencies": {
    "@ft/service-kit": "*",
    "fastify": "^5.12.1",
    "typebox": "^1.3.37"
  },
  "devDependencies": {
    "@types/node": "^22.20.1",
    "tsx": "^4.23.13",
    "typescript": "^7.0.2"
  }
}
```

**Créer le fichier `backend/services/skeleton-service/tsconfig.json`** — compile `src/` vers `dist/`.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" },
  "include": ["src/**/*.ts"]
}
```

**Créer le fichier `backend/services/skeleton-service/tsconfig.test.json`** — vérifie aussi les types des tests, sans rien produire.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

**Créer le fichier `backend/services/skeleton-service/Dockerfile`** — image du service. Son contexte de build est `backend/`.

```dockerfile
# Contexte de build : le dossier backend/, car l'image a besoin de packages/ en plus du service.
FROM docker.io/library/node:22-alpine AS build
WORKDIR /backend

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services/skeleton-service ./services/skeleton-service
RUN npm ci
RUN npm run build:packages

WORKDIR /backend/services/skeleton-service
RUN npm run build

FROM build AS runtime
# Retire les dépendances de développement ; le code compilé reste en place.
RUN cd /backend && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 4099

CMD ["npm", "run", "start"]
```

**Créer le fichier `backend/services/skeleton-service/src/config/env.ts`** — lit et valide les variables d'environnement au démarrage.

```ts
import { Type, type Static } from 'typebox'
import { Value } from 'typebox/value'

const EnvSchema = Type.Object({
  PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  JWT_SECRET: Type.String({ minLength: 1 }),
})

export type Config = { port: number; jwtSecret: string }

/** Port interne du service ; Compose ne le fournit pas, il fait partie du contrat avec Nginx. */
const defaultPort = 4099

/** Lit les variables d'environnement ; lève une erreur nommant la première variable invalide. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const [issue] = Value.Errors(EnvSchema, source)
  if (issue) {
    throw new Error(`Invalid environment: ${issue.instancePath || '/'} ${issue.message}`)
  }
  const env = source as Static<typeof EnvSchema>
  return { port: Number(env.PORT ?? defaultPort), jwtSecret: env.JWT_SECRET }
}
```

**Créer le fichier `backend/services/skeleton-service/src/domain/note.ts`** — le type métier et la fabrique de son erreur.

```ts
import { DomainError } from '@ft/service-kit'

export type Note = { id: string; ownerId: string; title: string }

export const noteNotFound = () => new DomainError(404, 'note_not_found')
```

**Créer le fichier `backend/services/skeleton-service/src/schemas/notes.schema.ts`** — ce que les routes acceptent et renvoient. Chaque objet porte `additionalProperties: false` pour refuser les champs inconnus.

```ts
import { UuidSchema } from '@ft/service-kit'
import { Type, type Static } from 'typebox'

export const CreateNoteBodySchema = Type.Object(
  { title: Type.String({ minLength: 1, maxLength: 100 }) },
  { additionalProperties: false }
)

export const NoteParamsSchema = Type.Object({ id: UuidSchema })

export const NoteSchema = Type.Object({ id: UuidSchema, title: Type.String() })

export type CreateNoteBody = Static<typeof CreateNoteBodySchema>
export type NoteParams = Static<typeof NoteParamsSchema>
export type NoteDto = Static<typeof NoteSchema>
```

**Créer le fichier `backend/services/skeleton-service/src/repositories/notes.repository.ts`** — le stockage, derrière un type. Dans un vrai service, c'est ici que se trouve Prisma.

```ts
import { randomUUID } from 'node:crypto'
import type { Note } from '../domain/note.js'

export type NotesRepository = {
  create: (ownerId: string, title: string) => Promise<Note>
  findOwned: (ownerId: string, id: string) => Promise<Note | null>
}

/** Stockage en mémoire du gabarit ; un vrai service utilise Prisma ici, et nulle part ailleurs. */
export function createInMemoryNotesRepository(): NotesRepository {
  const notes = new Map<string, Note>()

  return {
    async create(ownerId, title) {
      const note = { id: randomUUID(), ownerId, title }
      notes.set(note.id, note)
      return note
    },
    async findOwned(ownerId, id) {
      const note = notes.get(id)
      return note?.ownerId === ownerId ? note : null
    },
  }
}
```

**Créer le fichier `backend/services/skeleton-service/src/services/notes.service.ts`** — les règles métier. Il ne connaît ni HTTP ni la base.

```ts
import { noteNotFound, type Note } from '../domain/note.js'
import type { NotesRepository } from '../repositories/notes.repository.js'

export type NotesService = ReturnType<typeof createNotesService>

/** Règles métier des notes ; ne connaît ni HTTP ni la base. */
export function createNotesService(notes: NotesRepository) {
  return {
    create(ownerId: string, title: string): Promise<Note> {
      return notes.create(ownerId, title.trim())
    },

    async get(ownerId: string, id: string): Promise<Note> {
      const note = await notes.findOwned(ownerId, id.toLowerCase())
      if (!note) {
        throw noteNotFound()
      }
      return note
    },
  }
}
```

**Créer le fichier `backend/services/skeleton-service/src/controllers/notes.controller.ts`** — lit la requête validée, appelle le service, renvoie le DTO public.

```ts
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Note } from '../domain/note.js'
import type { CreateNoteBody, NoteDto, NoteParams } from '../schemas/notes.schema.js'
import type { NotesService } from '../services/notes.service.js'

export type NotesController = ReturnType<typeof createNotesController>

const toDto = (note: Note): NoteDto => ({ id: note.id, title: note.title })

/** Traduit HTTP vers le service et le résultat vers le DTO public ; aucune règle métier ici. */
export function createNotesController(notes: NotesService) {
  return {
    async create(request: FastifyRequest<{ Body: CreateNoteBody }>, reply: FastifyReply) {
      const note = await notes.create(request.userId, request.body.title)
      return reply.code(201).send(toDto(note))
    },

    async show(request: FastifyRequest<{ Params: NoteParams }>) {
      const note = await notes.get(request.userId, request.params.id)
      return toDto(note)
    },
  }
}
```

**Créer le fichier `backend/services/skeleton-service/src/routes/notes.routes.ts`** — la table des routes : URL, garde d'accès, schémas, contrôleur.

```ts
import type { App } from '@ft/service-kit'
import type { NotesController } from '../controllers/notes.controller.js'
import { CreateNoteBodySchema, NoteParamsSchema, NoteSchema } from '../schemas/notes.schema.js'

/** Table des routes des notes : URL, garde d'accès, schémas, puis le contrôleur. */
export function registerNotesRoutes(app: App, notes: NotesController) {
  const onRequest = app.authenticate

  app.post(
    '/notes',
    { onRequest, schema: { body: CreateNoteBodySchema, response: { 201: NoteSchema } } },
    notes.create
  )

  app.get(
    '/notes/:id',
    { onRequest, schema: { params: NoteParamsSchema, response: { 200: NoteSchema } } },
    notes.show
  )
}
```

**Créer le fichier `backend/services/skeleton-service/src/app.ts`** — assemble plugins et routes sans ouvrir de port. Les dépendances sont reçues en paramètre : les tests en passent des fausses.

```ts
import { authPlugin, createApp, opsPlugin } from '@ft/service-kit'
import type { Config } from './config/env.js'
import { createNotesController } from './controllers/notes.controller.js'
import type { NotesRepository } from './repositories/notes.repository.js'
import { registerNotesRoutes } from './routes/notes.routes.js'
import { createNotesService } from './services/notes.service.js'

const service = 'skeleton-service'

export type Dependencies = {
  notes: NotesRepository
  /** Doit rejeter quand le stockage est indisponible. */
  ready: () => Promise<unknown>
  logger?: boolean
}

/** Assemble le service sans ouvrir de port ; les tests y injectent leurs propres dépendances. */
export async function buildApp(config: Config, dependencies: Dependencies) {
  const app = createApp({
    service,
    logger: dependencies.logger,
    fallback: { status: 503, code: 'skeleton_unavailable' },
  })

  await app.register(opsPlugin, { service, ready: dependencies.ready })
  await app.register(authPlugin, { secret: config.jwtSecret })

  const notes = createNotesController(createNotesService(dependencies.notes))
  registerNotesRoutes(app, notes)

  return app
}
```

**Créer le fichier `backend/services/skeleton-service/src/server.ts`** — charge la configuration, crée les vraies dépendances et ouvre le port.

```ts
import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { createInMemoryNotesRepository } from './repositories/notes.repository.js'

const config = loadConfig()
const app = await buildApp(config, {
  notes: createInMemoryNotesRepository(),
  ready: async () => undefined,
})

await app.listen({ port: config.port, host: '0.0.0.0' })
```

**Créer le fichier `backend/services/skeleton-service/test/notes.test.ts`** — six tests qui prouvent l'auth, la validation stricte, les erreurs et les métriques.

```ts
import { DomainError } from '@ft/service-kit'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { createInMemoryNotesRepository } from '../src/repositories/notes.repository.js'

const userId = '11111111-1111-4111-8111-111111111111'
let app: Awaited<ReturnType<typeof buildApp>>
let authorization: string

before(async () => {
  app = await buildApp(
    { port: 0, jwtSecret: 'test-secret' },
    { notes: createInMemoryNotesRepository(), ready: async () => undefined, logger: false }
  )
  await app.ready()
  authorization = `Bearer ${app.jwt.sign({ sub: userId }, { expiresIn: '1h' })}`
})

after(() => app.close())

const post = (payload: unknown, headers = { authorization }) =>
  app.inject({ method: 'POST', url: '/notes', headers, payload: payload as object })

test('a private route refuses a request without token', async () => {
  const response = await post({ title: 'a' }, { authorization: '' })
  assert.equal(response.statusCode, 401)
  assert.deepEqual(response.json(), { error: 'unauthorized' })
})

test('a valid note is created then read by its owner', async () => {
  const created = await post({ title: '  Hello  ' })
  assert.equal(created.statusCode, 201)
  assert.equal(created.json().title, 'Hello')

  const read = await app.inject({ url: `/notes/${created.json().id}`, headers: { authorization } })
  assert.deepEqual(read.json(), created.json())
})

test('unknown fields and wrong types are refused, never converted', async () => {
  for (const payload of [{ title: 'a', extra: 1 }, { title: 5 }, {}, { title: '' }]) {
    const response = await post(payload)
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { error: 'invalid_request' })
  }
})

test('a domain error keeps its status and public code', async () => {
  const url = '/notes/22222222-2222-4222-8222-222222222222'
  const response = await app.inject({ url, headers: { authorization } })
  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.json(), { error: 'note_not_found' })
})

test('a domain error can carry extra public fields', async () => {
  const probe = await buildApp(
    { port: 0, jwtSecret: 'test-secret' },
    { notes: createInMemoryNotesRepository(), ready: async () => undefined, logger: false }
  )
  probe.get('/refused', async () => {
    throw new DomainError(409, 'username already registered', { code: 'USERNAME_TAKEN' })
  })
  const response = await probe.inject('/refused')
  await probe.close()
  assert.equal(response.statusCode, 409)
  assert.deepEqual(response.json(), {
    error: 'username already registered',
    code: 'USERNAME_TAKEN',
  })
})

test('ops routes answer and requests are measured by route pattern', async () => {
  assert.deepEqual((await app.inject('/health')).json(), {
    status: 'ok',
    service: 'skeleton-service',
  })
  assert.equal((await app.inject('/ready')).statusCode, 200)
  const metrics = (await app.inject('/metrics')).body
  assert.match(
    metrics,
    /http_request_duration_seconds_count\{service="skeleton-service",method="GET",route="\/notes\/:id",status_code="404"\} 1/
  )
  assert.match(metrics, /skeleton_service_process_cpu_user_seconds_total/)
})
```

### 0.6 Installer et vérifier

**Exécuter** chaque commande depuis `backend/`, dans cet ordre.

```bash
npm install
```

**Résultat attendu** : un dossier `backend/node_modules/` et un fichier
`backend/package-lock.json` apparaissent ; la sortie se termine par
`found 0 vulnerabilities` ou une liste d'avertissements, sans `npm error`.

```bash
npm run build:packages
```

**Résultat attendu** : aucune ligne `error TS` ; le dossier
`backend/packages/service-kit/dist/` apparaît.

```bash
npm run format
```

**Résultat attendu** : la liste des fichiers, sans erreur. Cette commande remet
au format les fichiers que tu viens de créer.

```bash
npm run typecheck -w @ft/skeleton-service
```

**Résultat attendu** : aucune sortie après la ligne `tsc -p tsconfig.test.json --noEmit`.

```bash
npm test -w @ft/skeleton-service
```

**Résultat attendu** : les dernières lignes contiennent `# pass 6` et `# fail 0`.

### 0.7 Lancer le service à la main

**Exécuter** depuis `backend/` :

```bash
npm run build -w @ft/skeleton-service
```

**Exécuter** depuis `backend/services/skeleton-service/` (le terminal reste
occupé par le serveur) :

```bash
JWT_SECRET=dev node dist/server.js
```

**Exécuter** dans un second terminal :

```bash
curl -s http://127.0.0.1:4099/health
```

**Résultat attendu** : `{"status":"ok","service":"skeleton-service"}`

```bash
curl -s -X POST -H 'content-type: application/json' -d '{"title":"x"}' http://127.0.0.1:4099/notes
```

**Résultat attendu** : `{"error":"unauthorized"}` (la route est privée).

Arrête le serveur avec `Ctrl+C` dans le premier terminal.

### 0.8 Valider l'image Docker

Docker doit être démarré, et la pile de développement lancée au moins une fois
(`make setup`), pour que le fichier `.env` existe.

**Modifier le fichier `docker-compose.yml`** — ajouter ce bloc juste avant la
ligne `  prometheus:` (deux espaces d'indentation, comme les autres services) :

```yaml
  skeleton-service:
    build:
      context: ./backend
      dockerfile: services/skeleton-service/Dockerfile
    environment:
      JWT_SECRET: ${JWT_SECRET}
    networks:
      - ft_network

```

**Exécuter** depuis la racine du dépôt :

```bash
docker compose up -d --build skeleton-service
```

```bash
docker compose exec skeleton-service node -e "fetch('http://127.0.0.1:4099/health').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
```

**Résultat attendu** : `200 {"status":"ok","service":"skeleton-service"}`

**Exécuter** pour arrêter et retirer ce conteneur de test :

```bash
docker compose rm -sf skeleton-service
```

**Modifier le fichier `docker-compose.yml`** — retirer le bloc `skeleton-service`
que tu viens d'ajouter. Il ne servait qu'à valider le Dockerfile, modèle des six
autres.

### 0.9 Commiter

**Exécuter** depuis la racine du dépôt :

```bash
git add .gitignore backend
```

```bash
git commit -m "build(backend): add the shared kit and the service template"
```

## 4. Ce que chaque conteneur doit offrir

Les scripts de `tests/` lancent ces commandes **dans** les conteneurs. Elles font
partie du contrat, comme les routes HTTP. Les fichiers de la section 5 les
fournissent déjà ; ce tableau sert à ne pas les casser.

| Élément | Exigence | Utilisé par |
|---|---|---|
| `npm test` | tourne dans la cible `build`, **sans base de données** | `music`, `e2e`, `files` |
| `npm run prisma:migrate:deploy` | cible `build`, lit `<SVC>_MIGRATION_DATABASE_URL` | conteneurs `migrate-*` |
| `npm run prisma:smoke` | cible `build`, lit **seulement** `<SVC>_DATABASE_URL` | `per` |
| `npm run seed:demo` | image runtime, Catalog et Media, rejouable sans doublon | `music`, `files` |
| `npm run start` | commande par défaut de l'image | Compose |
| Cibles Docker | `build`, puis `runtime` par défaut | Compose |
| `GET /ready` | 200 quand la base répond | healthchecks |
| Port | celui du service, **par défaut** : Compose ne fournit pas `PORT` | Nginx, Prometheus |
| `ffmpeg` | présent dans l'image Media | `files` |

## 5. La procédure pour un service

Elle est la même pour les six. Elle est écrite ici pour **`catalog-service`** ;
pour un autre service, remplace les valeurs en suivant ce tableau.

| Service | Port | Erreur imprévue | Variable de base | Garde d'accès | Variables en plus |
|---|---|---|---|---|---|
| catalog | 4002 | `503 catalog_unavailable` | `CATALOG_DATABASE_URL` | token interne | `INTERNAL_SERVICE_TOKEN` |
| library | 4004 | `503 library_unavailable` | `LIBRARY_DATABASE_URL` | JWT | `JWT_SECRET`, `CATALOG_SERVICE_URL` |
| playback | 4005 | `503 playback_unavailable` | `PLAYBACK_DATABASE_URL` | JWT | `JWT_SECRET`, `CATALOG_SERVICE_URL` |
| media | 4003 | `503 media_unavailable` | `MEDIA_DATABASE_URL` | JWT | `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `CATALOG_SERVICE_URL`, `MEDIA_STORAGE_DIR` |
| users | 4001 | `500 internal server error` | `USER_DATABASE_URL` | JWT + token interne | `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `AVATAR_STORAGE_DIR` |
| auth | 4000 | `500 internal server error` | `AUTH_DATABASE_URL` | — (il signe les JWT) | `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `USER_SERVICE_URL` |

« JWT » : garder `authPlugin` dans `app.ts`, comme dans le gabarit. « token
interne » : enregistrer `internalTokenPlugin`, comme dans l'exemple ci-dessous.

### A. Créer un service vide qui démarre

**Copier** le gabarit. **Exécuter** depuis la racine du dépôt :

```bash
cp -R backend/services/skeleton-service backend/services/catalog-service
```

**Supprimer** le dossier compilé copié avec lui et les fichiers de l'exemple
`notes` :

```bash
rm -rf backend/services/catalog-service/dist
```

```bash
cd backend/services/catalog-service && rm src/routes/notes.routes.ts src/controllers/notes.controller.ts src/schemas/notes.schema.ts src/services/notes.service.ts src/repositories/notes.repository.ts src/domain/note.ts test/notes.test.ts
```

**Créer le dossier** des scripts. **Exécuter** depuis la racine du dépôt :

```bash
mkdir -p backend/services/catalog-service/src/scripts
```

**Copier** Prisma depuis l'ancien service, sans rien modifier. **Exécuter** depuis
la racine du dépôt :

```bash
cp -R services/catalog-service/prisma backend/services/catalog-service/prisma
```

```bash
cp services/catalog-service/prisma.migration.config.ts backend/services/catalog-service/prisma.migration.config.ts
```

**Modifier le fichier `backend/services/catalog-service/prisma.migration.config.ts`**
— le dossier est un niveau plus bas qu'avant : remplacer `"../../.env"` par
`"../../../.env"`. C'est le seul changement.

**Modifier le fichier `backend/services/catalog-service/Dockerfile`** — remplacer
les trois occurrences de `skeleton-service` par `catalog-service`, et `4099` par
`4002`.

Les fichiers suivants **remplacent** ceux copiés du gabarit.

**Créer le fichier `backend/services/catalog-service/package.json`** — nom du service, scripts attendus par les tests, dépendances Prisma aux versions de l'ancien service. Pour un autre service, reprendre aussi les dépendances propres de son ancien `package.json` (`@fastify/multipart` et `sharp` pour Media, `@fastify/multipart` pour Users, `argon2` et `@fastify/rate-limit` pour Auth) ; retirer la ligne `seed:demo` sauf pour Catalog et Media.

```json
{
  "name": "@ft/catalog-service",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "engines": {
    "node": "22.x"
  },
  "scripts": {
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts",
    "prebuild": "npm run prisma:generate",
    "build": "tsc -p tsconfig.json",
    "typecheck": "npm run prisma:generate && tsc -p tsconfig.test.json --noEmit",
    "test": "tsx --test \"test/*.test.ts\"",
    "prisma:generate": "prisma generate --schema prisma/schema.prisma",
    "prisma:migrate:deploy": "prisma migrate deploy --config prisma.migration.config.ts",
    "prisma:smoke": "node dist/scripts/prisma-smoke.js",
    "seed:demo": "node dist/seed/seed-demo.js"
  },
  "dependencies": {
    "@ft/service-kit": "*",
    "@prisma/adapter-pg": "7.10.0",
    "@prisma/client": "7.10.0",
    "dotenv": "^17.4.2",
    "fastify": "^5.12.1",
    "pg": "^8.23.0",
    "typebox": "^1.3.37"
  },
  "devDependencies": {
    "@types/node": "^22.20.1",
    "@types/pg": "^8.23.1",
    "prisma": "7.10.0",
    "tsx": "^4.23.13",
    "typescript": "^7.0.2"
  }
}
```

**Créer le fichier `backend/services/catalog-service/src/config/env.ts`** — les variables du service et son port par défaut.

```ts
import { Type, type Static } from 'typebox'
import { Value } from 'typebox/value'

const EnvSchema = Type.Object({
  PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  CATALOG_DATABASE_URL: Type.String({ minLength: 1 }),
  INTERNAL_SERVICE_TOKEN: Type.String({ minLength: 1 }),
})

export type Config = { port: number; databaseUrl: string; internalServiceToken: string }

/** Port interne du service ; Compose ne le fournit pas, il fait partie du contrat avec Nginx. */
const defaultPort = 4002

/** Lit les variables d'environnement ; lève une erreur nommant la première variable invalide. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const [issue] = Value.Errors(EnvSchema, source)
  if (issue) {
    throw new Error(`Invalid environment: ${issue.instancePath || '/'} ${issue.message}`)
  }
  const env = source as Static<typeof EnvSchema>
  return {
    port: Number(env.PORT ?? defaultPort),
    databaseUrl: env.CATALOG_DATABASE_URL,
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
  }
}
```

**Créer le fichier `backend/services/catalog-service/src/repositories/prisma.ts`** — le client Prisma. Seuls les fichiers de `repositories/` importent le client généré.

```ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

export type Database = PrismaClient

/** Client Prisma du schéma du service ; ses droits viennent du rôle contenu dans l'URL. */
export function createPrisma(connectionString: string): Database {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}
```

**Créer le fichier `backend/services/catalog-service/src/scripts/prisma-smoke.ts`** — la vérification de connexion appelée par `tests/per`. Elle lit la variable directement, car ce test ne fournit pas les autres.

```ts
import { createPrisma } from '../repositories/prisma.js'

const url = process.env.CATALOG_DATABASE_URL
if (!url) {
  throw new Error('CATALOG_DATABASE_URL is required')
}

const prisma = createPrisma(url)
try {
  await prisma.$queryRaw`SELECT 1`
  console.log('catalog-service Prisma connection: ok')
} finally {
  await prisma.$disconnect()
}
```

**Créer le fichier `backend/services/catalog-service/src/app.ts`** — l'assemblage, pour l'instant sans route métier.

```ts
import { createApp, internalTokenPlugin, opsPlugin } from '@ft/service-kit'
import type { Config } from './config/env.js'

const service = 'catalog-service'

export type Dependencies = {
  /** Doit rejeter quand PostgreSQL est indisponible. */
  ready: () => Promise<unknown>
  /** Libère les ressources à la fermeture du serveur. */
  close?: () => Promise<unknown>
  logger?: boolean
}

/** Assemble le service sans ouvrir de port ; les tests y injectent leurs propres dépendances. */
export async function buildApp(config: Config, dependencies: Dependencies) {
  const app = createApp({
    service,
    logger: dependencies.logger,
    fallback: { status: 503, code: 'catalog_unavailable' },
  })

  await app.register(opsPlugin, { service, ready: dependencies.ready })
  await app.register(internalTokenPlugin, { token: config.internalServiceToken })
  app.addHook('onClose', async () => {
    await dependencies.close?.()
  })

  return app
}
```

**Créer le fichier `backend/services/catalog-service/src/server.ts`** — le câblage réel : `/ready` interroge PostgreSQL.

```ts
import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { createPrisma } from './repositories/prisma.js'

const config = loadConfig()
const prisma = createPrisma(config.databaseUrl)

const app = await buildApp(config, {
  ready: () => prisma.$queryRaw`SELECT 1`,
  close: () => prisma.$disconnect(),
})

await app.listen({ port: config.port, host: '0.0.0.0' })
```

**Créer le fichier `backend/services/catalog-service/test/app.test.ts`** — un premier test, qui passe sans base.

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'

const config = { port: 0, databaseUrl: 'unused', internalServiceToken: 'test-token' }

test('ready reflects the state of the database', async () => {
  const up = await buildApp(config, { ready: async () => undefined, logger: false })
  assert.equal((await up.inject('/ready')).statusCode, 200)
  await up.close()

  const down = await buildApp(config, {
    ready: () => Promise.reject(new Error('down')),
    logger: false,
  })
  const response = await down.inject('/ready')
  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.json(), { status: 'not-ready', service: 'catalog-service' })
  await down.close()
})
```

**Exécuter** depuis `backend/` :

```bash
npm install
```

```bash
npm run format
```

```bash
npm run typecheck -w @ft/catalog-service
```

**Résultat attendu** : une ligne `✔ Generated Prisma Client`, puis aucune ligne
`error TS`.

```bash
npm test -w @ft/catalog-service
```

**Résultat attendu** : `# pass 1` et `# fail 0`.

```bash
npm run build -w @ft/catalog-service
```

**Exécuter** depuis `backend/services/catalog-service/` :

```bash
node dist/server.js
```

**Résultat attendu** : le service refuse de démarrer avec
`Invalid environment: / must have required properties CATALOG_DATABASE_URL, INTERNAL_SERVICE_TOKEN`.
C'est voulu : il ne démarre jamais avec une configuration incomplète.

Tu as maintenant un service vide, correct, prêt à recevoir ses routes.

### B. Lire le contrat du service

**Ouvrir et lire**, dans cet ordre :

1. `docs/music/CATALOG_CONTRACT.md` (pour les autres : `LIBRARY_CONTRACT.md`,
   `PLAYBACK_CONTRACT.md`, `MEDIA_CONTRACT.md` et `FILES_CONTRACT.md` ; Users et
   Auth n'en ont pas) ;
2. les anciens tests `services/catalog-service/src/*.test.ts` : chaque cas est une
   exigence, avec le statut et le corps attendus ;
3. l'ancien code `services/catalog-service/src/` ;
4. le scénario de la campagne : `tests/music/http-scenario.mjs` (Catalog, Media,
   Library, Playback), `tests/e2e/http-scenario.mjs` (Users, Auth),
   `tests/files/verify-files.mjs` (Media). C'est lui qui tranche en cas de doute.

Note pour chaque route **l'ordre de ses refus** (401 avant 400, 404 avant 409…)
et les **corps exacts** : les scénarios comparent des chaînes littérales.

### C. Écrire le code du service

**Créer les fichiers** listés dans la section du service (section 6), dans cet
ordre de dossiers : `domain/`, `schemas/`, `repositories/`, `clients/`,
`services/`, `controllers/`, `routes/`, puis compléter `app.ts` et `server.ts`.
Le contenu de ces fichiers est le travail de réécriture lui-même : la section 6
dit quoi mettre dans chacun et d'où le reprendre, les fichiers `notes` du gabarit
montrent la forme.

Trois règles de traduction depuis l'ancien code :

- **Un `try/catch` qui renvoyait `503` disparaît.** L'erreur remonte ; le
  gestionnaire commun la journalise et renvoie l'erreur imprévue du service.
- **Une `PlaylistError`, `PlaybackError` ou `FileError` devient une
  `DomainError`**, créée par une fabrique nommée de `domain/`, par exemple
  `export const trackNotFound = () => new DomainError(404, 'track_not_found')`.
  Le troisième argument ajoute des champs publics :
  `new DomainError(409, 'username already registered', { code: 'USERNAME_TAKEN' })`
  répond `{"error":"username already registered","code":"USERNAME_TAKEN"}`.
- **Ce qu'un schéma ne sait pas exprimer se valide dans `domain/`.** Exemple : une
  longueur mesurée après `trim()`. Le schéma contrôle le type ; la fonction de
  domaine contrôle la règle et lève `new DomainError(400, 'invalid_request')`.

`app.authenticate` et `app.requireInternalToken` se posent en `onRequest`, donc
avant la validation : un appel sans token reçoit 401 même si son corps est
invalide, comme aujourd'hui.

### D. Porter les tests

**Créer les fichiers** `backend/services/catalog-service/test/*.test.ts` en
reprenant un par un les cas des anciens `services/catalog-service/src/*.test.ts`,
adaptés à `buildApp(config, dependencies)` avec de faux repositories. Ajoute un
test par fonction de `domain/` qui porte une règle.

**Exécuter** depuis `backend/` :

```bash
npm run format
```

```bash
npm run typecheck -w @ft/catalog-service
```

```bash
npm test -w @ft/catalog-service
```

**Résultat attendu** : `# fail 0`.

**Exécuter** depuis la racine du dépôt, pour commiter le service :

```bash
git add backend
```

```bash
git commit -m "feat(catalog): rewrite the service in the backend workspace"
```

### E. Basculer Compose sur le nouveau service

Le service apparaît dans plusieurs fichiers. Fais le changement dans **chacun** de
ceux qui le concernent :

| Fichier | Bloc `<service>` présent pour | Bloc `migrate-<service>` |
|---|---|---|
| `docker-compose.yml` | les six services | les six |
| `tests/music/compose.yml` | les six services | les six |
| `tests/e2e/compose.yml` | auth et user seulement | les six |
| `tests/per/compose.yml` | aucun | les six |

**Modifier le fichier `docker-compose.yml`** — dans le bloc `catalog-service`,
remplacer la ligne

```yaml
    build: ./services/catalog-service
```

par

```yaml
    build:
      context: ./backend
      dockerfile: services/catalog-service/Dockerfile
```

et dans le bloc `migrate-catalog`, remplacer

```yaml
    build:
      context: ./services/catalog-service
      target: build
```

par

```yaml
    build:
      context: ./backend
      dockerfile: services/catalog-service/Dockerfile
      target: build
```

**Modifier les fichiers `tests/music/compose.yml`, `tests/e2e/compose.yml` et
`tests/per/compose.yml`** — même changement, avec `../../backend` comme contexte :

```yaml
    build:
      context: ../../backend
      dockerfile: services/catalog-service/Dockerfile
```

(et la ligne `target: build` en plus dans les blocs `migrate-catalog`). Ne touche
à rien d'autre dans ces blocs : variables, volumes, healthchecks et commandes
restent.

### F. Lancer les campagnes

Docker doit tourner. **Exécuter** depuis la racine du dépôt les campagnes de la
ligne du service dans le tableau de la section 1. Pour Catalog :

```bash
tests/per/run.sh
```

```bash
tests/music/run.sh catalog
```

**Résultat attendu** : chaque campagne se termine par une ligne `PASS`.

En cas d'échec, le runner affiche `FAIL phase=<nom>`. Le nom de la phase désigne
le bloc du scénario à relire. Corrige le nouveau service, jamais le test, puis
relance.

Les autres campagnes se lancent ainsi : `tests/music/run.sh library`,
`tests/music/run.sh playback`, `tests/e2e/run.sh`, `tests/files/run.sh`. Lis le
`README.md` du dossier de la campagne avant son premier lancement, en particulier
`tests/files/README.md` : cette campagne utilise la pile de développement.

### G. Commiter la bascule

**Exécuter** depuis la racine du dépôt :

```bash
git add docker-compose.yml tests/music/compose.yml tests/e2e/compose.yml tests/per/compose.yml
```

```bash
git commit -m "build(catalog): switch compose to the rewritten service"
```

Pour revenir à l'ancien service plus tard, `git revert` de ce commit suffit :
l'ancien dossier `services/catalog-service` est toujours là.

## 6. Les six services

Pour chaque service : les fichiers à créer au point C de la procédure, ce que
chacun contient, et les pièges propres au service. Les chemins sont relatifs à
`backend/services/<service>/src/`. Les noms sont une proposition ; ce qui compte
est le dossier et le rôle.

### Étape 1 — catalog-service

Lecture seule, aucune route privée. Il valide le socle sur un vrai service.

| Fichier à créer | Contenu | Repris de |
|---|---|---|
| `domain/track.ts` | type du morceau, conversion ligne SQL → DTO, refus d'une durée non représentable, fabrique `trackNotFound` | `catalog.ts` (`toTrackDto`) |
| `schemas/tracks.schema.ts` | query de la liste, paramètre `id`, DTO `Track`, page `TrackList` | `catalog.ts` (`parseTrackQuery`) |
| `schemas/assets.schema.ts` | paramètre `id`, réponses `{published}` et `{referenced}` | `app.ts` |
| `repositories/track-list.sql.ts` | les fragments SQL fixes de la liste | `database/catalog-list.ts` |
| `repositories/tracks.repository.ts` | lecture d'un morceau publié, liste paginée en transaction `RepeatableRead` | `database/catalog-list.ts`, `index.ts` (`readTrack`) |
| `repositories/assets.repository.ts` | « cet audio est-il publié ? », « ce fichier est-il référencé ? » | `database/check-asset-references.ts`, `index.ts` |
| `services/tracks.service.ts` | lire un morceau ou lever `trackNotFound`, lister | `app.ts` |
| `services/assets.service.ts` | publication et références | `app.ts` |
| `controllers/tracks.controller.ts`, `controllers/assets.controller.ts` | un par fichier de routes | `app.ts` |
| `routes/tracks.routes.ts` | `GET /tracks`, `GET /tracks/:id` | `app.ts` |
| `routes/assets.routes.ts` | `GET /assets/:id/publication`, `GET /internal/assets/:id/references` | `app.ts` |
| `seed/seed-demo.ts` | les données de démonstration | `database/seed.ts` |

Pièges :

- **La requête SQL de liste est reprise telle quelle** (`$queryRaw`, échappement
  de `%` et `_`). On la découpe et on la nomme ; on ne la réécrit pas.
- Le schéma de la query refuse les paramètres inconnus, borne `q` et `genre` à
  200 caractères, `sort` à `title|artist|duration`, `pageSize` à 100.
- Les deux routes `assets` répondent avec l'en-tête `Cache-Control: no-store`.
- La route `/internal/…` porte `onRequest: app.requireInternalToken`.
- La campagne lance `seed:demo` **deux fois de suite** puis vérifie l'état : le
  seed ne doit créer aucun doublon.

### Étape 2 — library-service

Premier service privé et premier appel vers un autre service.

| Fichier à créer | Contenu | Repris de |
|---|---|---|
| `domain/playlist.ts` | types, `toPlaylist`, règles de nom et de description, fabriques d'erreurs | `playlist.ts` |
| `schemas/playlists.schema.ts` | corps de création, de modification, d'ajout, `expectedVersion`, DTO | `playlist.ts` |
| `repositories/playlists.repository.ts` | lectures paginées, lecture d'une playlist, création | `index.ts` |
| `repositories/playlist-lock.ts` | transaction + `SELECT … FOR UPDATE` + contrôle de version | `database/mutations.ts` (`withPlaylist`) |
| `repositories/playlist-mutations.repository.ts` | ajout, retrait, modification, suppression, sous le verrou | `database/mutations.ts` |
| `clients/catalog.client.ts` | « ce morceau est-il publié ? » | `catalog.ts` |
| `services/playlists.service.ts`, `services/playlist-items.service.ts` | règles métier | `app.ts` |
| `controllers/` et `routes/` | `playlists` et `playlist-items` | `app.ts` |

Pièges :

- **Ordre des refus à l'ajout d'un morceau** : playlist absente (404) → version
  périmée (409) → morceau non publié (404) → ajout.
- `name` fait 1 à 100 caractères et `description` au plus 2000, comptés **après
  `trim()`** : règle de `domain/`, pas de schéma.
- `PATCH` exige au moins `name` ou `description`, plus `expectedVersion`.
- Les deux `DELETE` reçoivent `{ "expectedVersion": n }` dans le corps.
- Les fonctions appelées sous le verrou reçoivent le client de transaction en
  paramètre et n'utilisent jamais le client global.
- Le même morceau peut figurer plusieurs fois ; une suppression ne renumérote pas
  les positions.

À ajouter au socle pendant cette étape : **créer le fichier
`backend/packages/service-kit/src/http-client.ts`**, un `fetch` avec délai de 2 s,
`redirect: 'error'` et réponse validée, puis l'exporter dans `index.ts`. Library,
Playback, Media et Auth en ont besoin.

### Étape 3 — playback-service

| Fichier à créer | Contenu | Repris de |
|---|---|---|
| `domain/session.ts` | types, `toSession`, `toHistorySession`, fabriques d'erreurs | `session.ts` |
| `domain/progress.ts` | `recordProgress`, `recordClose` | `progress.ts` |
| `schemas/sessions.schema.ts` | corps d'ouverture, de progression, de clôture, DTO | `session.ts` |
| `repositories/sessions.repository.ts` | création, historique paginé | `index.ts` |
| `repositories/session-lock.ts` | transaction + `FOR UPDATE` sur la session du propriétaire | `database/mutations.ts` |
| `clients/catalog.client.ts` | durée d'un morceau publié | `catalog.ts` |
| `services/sessions.service.ts` | règles métier | `app.ts` |
| `controllers/sessions.controller.ts`, `routes/sessions.routes.ts` | les quatre routes | `app.ts` |

Pièges :

- **`domain/progress.ts` porte l'algorithme de crédit du temps d'écoute.** Porte
  d'abord les cas de l'ancien `app.test.ts`, puis réécris le code lisiblement en
  gardant les quatre bornes et leur minimum.
- Le corps de la progression contient exactement trois entiers ≥ 0 ; `sequence`
  va de 1 à 2147483647.
- `POST /sessions/:id/close` accepte un corps absent ou `{}`, rien d'autre.
- Un événement déjà reçu avec les mêmes valeurs est reconfirmé sans écriture ;
  avec des valeurs différentes, `409 progress_conflict`.

### Étape 4 — media-service

Le plus volumineux. La logique de validation et de stockage est correcte et
testée : on la redécoupe, on ne la réinvente pas.

| Fichier à créer | Contenu | Repris de |
|---|---|---|
| `domain/file.ts` | DTO public, limites de taille, fabriques d'erreurs | `file-definitions.ts`, `validate-file.ts` |
| `schemas/files.schema.ts` | pagination, paramètre `id`, DTO | `register-file-reads.ts` |
| `validation/validate-file.ts`, `validation/decode-file.ts` | validation dans un processus isolé | fichiers du même nom |
| `storage/` (plusieurs fichiers) | zone temporaire, liens, lecture sûre d'un fichier, plages d'octets | `save-file.ts`, `app.ts`, `register-file-reads.ts` |
| `repositories/assets.repository.ts` | création, liste, lecture, transitions `deleting`/`deleted` | `database/*.ts` |
| `clients/catalog.client.ts` | publication et références | `publication.ts`, `check-catalog-references.ts` |
| `services/upload.service.ts` | réception → validation → publication → SQL | `save-file.ts`, `register-file-upload.ts` |
| `services/upload-gate.ts` | un seul transfert à la fois | variable `receiving` |
| `services/file-deletion.service.ts` | suppression reprenable | `delete-file.ts` |
| `services/recovery.service.ts` | reprise des uploads et suppressions interrompus | `save-file.ts`, `delete-file.ts` |
| `controllers/` et `routes/` | `audio` (public) et `files` (privé) | `app.ts`, `register-file-*.ts` |
| `seed/seed-demo.ts`, `seed/audio-fixture.ts` | fichiers audio de démonstration | `database/seed.ts`, `database/audio-fixture.ts` |

Pièges :

- **Modifier le fichier `Dockerfile`** du service : ajouter la ligne
  `RUN apk add --no-cache ffmpeg` juste après `WORKDIR /backend`.
- Les corps d'erreur portent un champ `message` en français : troisième argument
  de `DomainError`.
- `HEAD` répond sans corps, y compris en erreur, et l'instance Fastify est créée
  avec `exposeHeadRoutes: false`. À ajouter au socle ici : **modifier
  `backend/packages/service-kit/src/create-app.ts`** pour accepter des options
  Fastify supplémentaires.
- Les variables de module `receiving` et `busy` deviennent l'état d'un objet créé
  dans `app.ts`.
- `decode-file.ts` est lancé comme processus séparé par son chemin : les deux
  fichiers de `validation/` doivent rester dans le même dossier.
- La reprise (`recovery.service.ts`) s'exécute dans `server.ts` **avant**
  `listen`.
- `seed:demo` crée `demo-1.wav` à `demo-3.wav` dans `/data/audio` ; la campagne
  vérifie qu'il ne reste qu'eux à la fin.
- `tests/files/run.sh` se lance **deux fois de suite**.

### Étape 5 — user-service

La moitié des routes vit aujourd'hui dans `index.ts`, sans test : c'est le
service où la structure change le plus.

| Fichier à créer | Contenu | Repris de |
|---|---|---|
| `domain/username.ts`, `domain/profile.ts` | normalisation, règles de `displayName` et `bio`, erreurs | `app.ts` |
| `domain/avatar.ts` | détection du type par la signature du fichier | `app.ts` |
| `domain/presence.ts` | « en ligne » = présent et vu depuis moins de 120 s | `index.ts` (recopié trois fois) |
| `schemas/` | profil, commande interne de création | `app.ts` |
| `repositories/` | `profiles`, `friends`, `presence`, `inbox` | `index.ts` |
| `storage/avatar-storage.ts` | lecture et écriture sur le volume | `index.ts` |
| `services/` | `profiles`, `avatars`, `friends`, `presence`, `profile-provision` | `app.ts`, `index.ts` |
| `controllers/` et `routes/` | `me`, `avatars`, `profiles`, `friends`, `presence`, `internal` | `app.ts`, `index.ts` |

Pièges :

- **Les messages d'erreur sont des phrases** que `tests/e2e` compare :
  `'unauthorized'`, `'unsupported avatar mime type'`, `'displayName must be between
  1 and 60 chars'`… Fais ces validations dans `domain/` avec des `DomainError`
  portant le texte exact, pas dans les schémas.
- Users exige un UUID **versionné** ; `UuidSchema` du socle est plus large.
  Déclare un schéma local strict.
- La création de profil interne est idempotente : ligne d'inbox et profil dans la
  même transaction, puis traitement de l'erreur d'unicité Prisma `P2002`.
- L'avatar : 2 MiB au plus, type déclaré comparé à la signature réelle,
  `413 avatar must not exceed 2 MiB`.
- `/ready` répond aujourd'hui 200 sans interroger la base ; le faire interroger
  la base reste compatible avec le contrat.

### Étape 6 — auth-service

En dernier : il signe les tokens, et les cinq services qui les vérifient sont
alors déjà prouvés.

| Fichier à créer | Contenu | Repris de |
|---|---|---|
| `domain/credentials.ts` | règles d'email, de mot de passe, de username | `app.ts` |
| `domain/registration.ts` | états du compte, types de livraison, erreurs | `handle-profile-creation-result.ts` |
| `schemas/auth.schema.ts` | corps de `signup` et `login` | `app.ts` |
| `repositories/accounts.repository.ts`, `repositories/outbox.repository.ts` | compte + message d'outbox dans une transaction, relances | `database/registration-store.ts` |
| `clients/users.client.ts` | `PUT /internal/profiles/:userId` | `request-profile-creation.ts` |
| `services/signup.service.ts`, `services/login.service.ts`, `services/profile-delivery.service.ts` | règles métier | `app.ts`, `handle-profile-creation-result.ts` |
| `workers/outbox.worker.ts` | relance périodique des demandes de profil | `index.ts` |
| `controllers/auth.controller.ts`, `routes/auth.routes.ts` | `signup`, `login`, `verify` | `app.ts` |

Pièges :

- Les réponses portent `error` **et** `code` ; les réponses `202` portent
  `status`, `code`, `retryAfterSeconds`. `tests/e2e` lit le champ `code`.
- `@fastify/rate-limit` : `global: false`, puis 10 requêtes par minute sur
  `/signup` et 20 sur `/login`.
- Le token ne change pas : HS256, `{ sub, email }`, une heure.
- Le worker (toutes les 2 s, 20 messages au plus, jamais deux passes en même
  temps) démarre dans `server.ts` après `listen` et s'arrête à la fermeture.
- Le hachage reste `argon2` : les comptes existants doivent pouvoir se connecter.

## 7. Étape 7 — Supprimer l'ancienne implémentation

À faire seulement quand les six bascules sont commitées et que les quatre
campagnes passent sur le même commit.

**Exécuter** depuis la racine du dépôt, pour vérifier que plus rien ne pointe sur
l'ancien code :

```bash
grep -rn "services/" docker-compose.yml tests/*/compose.yml | grep -v backend
```

**Résultat attendu** : aucune ligne. Sinon, une bascule est incomplète.

**Exécuter** depuis la racine du dépôt, pour conserver la documentation puis
supprimer l'ancien code et le gabarit :

```bash
mkdir -p backend/docs
```

```bash
git mv services/PRISMA.md backend/docs/PRISMA.md
```

```bash
git mv services/CONVENTIONS.md backend/docs/CONVENTIONS.md
```

```bash
git rm -r services backend/services/skeleton-service
```

**Exécuter** depuis `backend/`, pour retirer le gabarit du lockfile :

```bash
npm install
```

**Modifier le fichier `.gitignore`** — retirer le bloc « Generated Prisma clients
and TypeScript builds », soit les douze lignes `services/<service>/src/generated/prisma/`
et `services/<service>/dist/`.

**Modifier le fichier `tests/music/run.sh`** — dans la ligne
`git status --porcelain -- tests/music services frontend nginx database`,
remplacer `services` par `backend`.

**Modifier le fichier `tests/files/run.sh`** — dans la ligne
`git status --porcelain -- tests/files services frontend nginx database README.md`,
remplacer `services` par `backend`.

**Modifier la documentation** qui cite l'ancien dossier : le tableau des services
de `README.md`, `docs/STRUCTURE_SERVICES.md`, `backend/docs/PRISMA.md`, et les
`README.md` de `tests/`. Pour les trouver :

```bash
grep -rln "services/" README.md docs tests/*/README.md backend/docs
```

**Exécuter** depuis la racine du dépôt, pour rejouer toute la preuve :

```bash
tests/per/run.sh
```

```bash
tests/e2e/run.sh
```

```bash
tests/music/run.sh playback
```

```bash
tests/files/run.sh
```

**Résultat attendu** : quatre lignes `PASS`. `tests/files/run.sh` applique les six
migrations sur des volumes neufs puis restaure les tiens : il prouve aussi le
démarrage à partir de zéro.

**Exécuter** pour reconstruire la pile de développement, puis commiter :

```bash
make setup
```

```bash
git add -A
```

```bash
git commit -m "chore(backend): remove the previous service implementation"
```

## 8. Liste de contrôle par service

- [ ] A. service vide créé, `npm test` affiche `# pass 1`
- [ ] B. contrat, anciens tests et scénario de campagne relus
- [ ] C. fichiers de la section 6 créés, règles d'écriture respectées
- [ ] D. anciens cas de test portés, `format`, `typecheck` et `test` verts
- [ ] D. commit du service
- [ ] E. blocs Compose basculés dans tous les fichiers concernés
- [ ] F. campagnes de la ligne du service terminées par `PASS`
- [ ] G. commit de la bascule
