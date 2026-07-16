import { createController } from 'remix/router'

import { routes } from '../../routes.ts'
import { AppPage } from '../home.tsx'

export default createController(routes.collections, {
  actions: {
    show({ params, render }) {
      return render(<AppPage page="collection" collectionId={params.collectionId} />)
    },
    compare({ params, render }) {
      return render(<AppPage page="compare" collectionId={params.collectionId} />)
    },
    ranking({ params, render }) {
      return render(<AppPage page="ranking" collectionId={params.collectionId} />)
    },
  },
})
