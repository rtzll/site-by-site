import { createRouter, type MiddlewareContext } from 'remix/router'
import { staticFiles } from 'remix/middleware/static'

import rootController from './actions/controller.tsx'
import collectionsController from './actions/collections/controller.tsx'
import { render } from './middleware/render.tsx'
import { routes } from './routes.ts'

type AppContext = MiddlewareContext<[ReturnType<typeof render>]>

declare module 'remix/router' {
  interface RouterTypes {
    context: AppContext
  }
}

export function createAppRouter() {
  let router = createRouter<AppContext>({
    middleware: [
      staticFiles('./public', { index: false }),
      staticFiles('./dist/client', { index: false }),
      render(),
    ],
  })

  router.map(routes, rootController)
  router.map(routes.collections, collectionsController)
  return router
}

export const router = createAppRouter()
