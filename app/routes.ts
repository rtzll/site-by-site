import { get, post, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  home: get('/'),
  collections: {
    create: post('/collections'),
    inspectBookmarks: post('/collections/bookmarks'),
    confirmBookmarks: post('/collections/bookmarks/confirm'),
    show: get('/collections/:collectionId'),
    addSites: post('/collections/:collectionId/sites'),
    prepare: get('/collections/:collectionId/prepare'),
    progress: get('/collections/:collectionId/progress'),
    compare: get('/collections/:collectionId/compare'),
    vote: post('/collections/:collectionId/compare/vote'),
    runtimeFailed: post('/collections/:collectionId/compare/runtime-failed'),
    ranking: get('/collections/:collectionId/ranking'),
  },
})
