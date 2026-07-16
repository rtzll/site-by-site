import { createRouter, type MiddlewareContext } from 'remix/router'
import { formData } from 'remix/middleware/form-data'
import { staticFiles } from 'remix/middleware/static'

import rootController from './actions/controller.tsx'
import collectionsController from './actions/collections/controller.tsx'
import { loadDatabase } from './middleware/database.ts'
import { render } from './middleware/render.tsx'
import { routes } from './routes.ts'

type AppContext = MiddlewareContext<
  [ReturnType<typeof formData>, ReturnType<typeof loadDatabase>, ReturnType<typeof render>]
>

declare module 'remix/router' {
  interface RouterTypes {
    context: AppContext
  }
}

export function createAppRouter() {
  let router = createRouter<AppContext>({
    middleware: [staticFiles('./public', { index: false }), formData(), loadDatabase(), render()],
  })

  router.map(routes, rootController)
  router.map(routes.collections, collectionsController)
  return router
}

export const router = createAppRouter()
