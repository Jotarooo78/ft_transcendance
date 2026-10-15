/** Chemins publics et personnels des projets ; toutes les réponses sont non mises en cache. */
import { noStore, type App } from '@ft/service-kit'
import type { createProjectsController } from '../controllers/projects.controller.js'
import {
  ProjectBody,
  ProjectCommand,
  ProjectParams,
  ProjectQuery,
} from '../schemas/projects.schema.js'
/** Installe les schémas avant les contrôleurs ; l’authentification personnelle passe par Users. */
export function registerProjectsRoutes(
  app: App,
  controller: ReturnType<typeof createProjectsController>
) {
  for (const [prefix, personal] of [
    ['/projects', false],
    ['/me/projects', true],
  ] as const) {
    app.get(
      prefix,
      { onRequest: noStore, schema: { querystring: ProjectQuery } },
      controller.list(personal)
    )
    app.get(
      `${prefix}/:id`,
      { onRequest: noStore, schema: { params: ProjectParams } },
      controller.get(personal)
    )
  }
  app.put(
    '/me/projects/:id',
    { onRequest: noStore, schema: { params: ProjectParams, body: ProjectBody } },
    controller.save
  )
  app.post(
    '/me/projects/:id/publish',
    { onRequest: noStore, schema: { params: ProjectParams, body: ProjectCommand } },
    controller.publish
  )
  app.delete(
    '/me/projects/:id',
    { onRequest: noStore, schema: { params: ProjectParams, body: ProjectCommand } },
    controller.discard
  )
}
