import { run } from 'remix/ui'

import { SiteBySiteApp, SiteBySiteEntryId } from './site-by-site.tsx'

if ('navigation' in window) {
  let app = run({
    async loadModule(_moduleUrl, exportName) {
      if (exportName === SiteBySiteEntryId) return SiteBySiteApp
      throw new Error(`Unknown client entry: ${exportName}`)
    },
    async resolveFrame(src, signal) {
      let response = await fetch(src, { headers: { Accept: 'text/html' }, signal })
      if (!response.ok) return `<pre>Frame error: ${response.status}</pre>`
      return response.body ?? (await response.text())
    },
  })

  app.ready().catch((error: unknown) => {
    console.error('Site by Site hydration failed:', error)
  })
}
