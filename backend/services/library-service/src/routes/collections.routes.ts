import { noStore, PageQuerySchema, type App } from '@ft/service-kit'
import {
  CollectionPageSchema,
  CollectionParamsSchema,
  CollectionTargetSchema,
} from '../schemas/collections.schema.js'
import type { createCollectionsController } from '../controllers/collections.controller.js'
/** @brief Routes privées avec validation fermée et interdiction de mise en cache. */
export function registerCollectionsRoutes(
  app: App,
  controller: ReturnType<typeof createCollectionsController>
) {
  const onRequest = [noStore, app.authenticate]
  app.get(
    '/collections/:kind',
    {
      onRequest,
      schema: {
        params: CollectionParamsSchema,
        querystring: PageQuerySchema,
        response: { 200: CollectionPageSchema },
      },
    },
    controller.list
  )
  app.put(
    '/collections/:kind/:id',
    { onRequest, schema: { params: CollectionTargetSchema } },
    controller.save
  )
  app.delete(
    '/collections/:kind/:id',
    { onRequest, schema: { params: CollectionTargetSchema } },
    controller.remove
  )
}
