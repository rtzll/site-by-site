import { createAssetServer } from 'remix/assets'

const isDevelopment = (process.env.NODE_ENV ?? 'development') === 'development'

export const assetServer = createAssetServer({
  basePath: '/assets',
  rootDir: process.cwd(),
  mounts: {
    app: 'app',
    node_modules: 'node_modules',
  },
  allowFiles: ['app/**', 'node_modules/**'],
  denyFiles: ['app/**/*.server.*', 'app/actions/**', 'app/middleware/**'],
  sourceMaps: isDevelopment ? 'external' : undefined,
  minify: !isDevelopment,
  watch: isDevelopment,
})
