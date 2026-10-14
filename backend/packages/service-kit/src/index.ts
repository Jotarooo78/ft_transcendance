/**
 * @file index.ts
 * @brief Porte d'entrée du paquet `@ft/service-kit`, la boîte à outils commune aux six services.
 *
 * @details Les six services du backend font tous certaines choses de la même manière : créer un
 *   serveur web, vérifier le jeton de connexion d'un utilisateur, répondre aux erreurs dans le même
 *   format, appeler un autre service. Plutôt que de recopier ce code six fois, il est écrit une
 *   seule fois dans ce paquet.
 *
 * Ce fichier liste tout ce qu'un service a le droit d'utiliser. Un service écrit `import {
 * createApp, DomainError } from '@ft/service-kit'` et n'importe jamais directement un autre fichier
 * du paquet. Si tu ajoutes une fonction partagée, il faut l'exporter ici pour qu'elle soit
 * utilisable.
 *
 * Attention : les services utilisent la version compilée de ce paquet. Après toute modification,
 * lance `npm run build:packages` depuis `backend/`, sinon le changement est ignoré.
 */

export { createApp, type App, type CreateAppOptions } from './create-app.js'
export { DomainError, invalidRequest } from './domain-error.js'
export { readEnv } from './env.js'
export { noStore } from './hooks.js'
export { fetchJson, isRecord, type JsonRequest, type JsonResponse } from './http-client.js'
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
  type PaginationLimits,
} from './schemas.js'
