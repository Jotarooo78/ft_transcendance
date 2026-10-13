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
