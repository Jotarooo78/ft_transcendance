import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { createInMemoryNotesRepository } from './repositories/notes.repository.js'

const config = loadConfig()
const app = await buildApp(config, {
  notes: createInMemoryNotesRepository(),
  ready: async () => undefined,
})

await app.listen({ port: config.port, host: '0.0.0.0' })
