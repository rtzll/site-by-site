import { get, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  home: get('/'),
  collections: {
    show: get('/collections/:collectionId'),
    compare: get('/collections/:collectionId/compare'),
    ranking: get('/collections/:collectionId/ranking'),
  },
})
