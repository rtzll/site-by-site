import { createRouter, type MiddlewareContext } from 'remix/router'

import rootController from './actions/worker-controller.tsx'
import collectionsController from './actions/collections/controller.tsx'
import { render } from './middleware/render.tsx'
import { routes } from './routes.ts'

type AppContext = MiddlewareContext<[ReturnType<typeof render>]>

export function createWorkerRouter() {
  let router = createRouter<AppContext>({ middleware: [render()] })

  router.map(routes, rootController)
  router.map(routes.collections, collectionsController)
  return router
}

export const workerRouter = createWorkerRouter()
