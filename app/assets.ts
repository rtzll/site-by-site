import { createAssetServer } from 'remix/assets'

const isDevelopment = (process.env.NODE_ENV ?? 'development') === 'development'

export const assetServer = createAssetServer({
  basePath: '/assets',
  rootDir: process.cwd(),
  fileMap: {
    'app/*path': 'app/*path',
    'node_modules/*path': 'node_modules/*path',
  },
  allow: ['app/**', 'node_modules/**'],
  deny: ['app/**/*.server.*', 'app/actions/**', 'app/middleware/**'],
  sourceMaps: isDevelopment ? 'external' : undefined,
  minify: !isDevelopment,
  watch: isDevelopment,
})
