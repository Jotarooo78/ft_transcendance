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
