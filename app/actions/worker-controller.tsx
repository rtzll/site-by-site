import { createController } from 'remix/router'

import { routes } from '../routes.ts'
import { AppPage } from './home.tsx'

export default createController(routes, {
  actions: {
    assets() {
      return new Response('Not Found', { status: 404 })
    },
    home({ render }) {
      return render(<AppPage page="home" />)
    },
  },
})
