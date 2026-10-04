import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import type { ImportMapData } from 'remix/component/server'

import { createAppRouter } from '../router.ts'
import { routes } from '../routes.ts'

const origin = 'https://site-by-site.test'

describe('local-first application routes', () => {
  it('serves the browser entry with its required module mappings', async () => {
    let router = createAppRouter()
    let html = await (await router.fetch(new URL('/', origin))).text()
    let entry = html.match(/<script type="module" src="([^"]+)"/)
    assert.ok(entry)
    let response = await router.fetch(new URL(entry[1], origin))
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /javascript/)

    if (process.env.NODE_ENV !== 'development') {
      assert.equal(entry[1], '/assets/entry.js')
      return
    }

    let importMapTag = html.match(/<script[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/)
    assert.ok(importMapTag, 'Development scripts need an import map before they can load')
    assert.ok(html.indexOf(importMapTag[0]) < html.indexOf(entry[0]))

    let importMap = JSON.parse(importMapTag[1]) as ImportMapData
    let appImports = importMap.scopes?.['/assets/app/']
    assert.ok(appImports?.idb, 'Missing browser mapping for idb')

    // Remix optimizes named imports into direct module URLs, so dependencies
    // must be checked through module preloads as well as import-map mappings.
    let preloadHrefs = Array.from(
      html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"[^>]*>/g),
      (match) => match[1],
    )
    assert.ok(preloadHrefs.length > 0, 'Development scripts need module preloads')
    let moduleHrefs = new Set([
      ...Object.values(importMap.scopes ?? {}).flatMap(Object.values),
      ...preloadHrefs,
    ])
    for (let href of moduleHrefs) {
      assert.ok(href)
      let module = await router.fetch(new URL(href, origin))
      assert.equal(module.status, 200, `Browser dependency must be served: ${href}`)
      assert.match(module.headers.get('content-type') ?? '', /javascript/)
      await module.text()
    }
  })

  it('renders the browser-owned import shell', async () => {
    let response = await createAppRouter().fetch(new URL(routes.home.href(), origin))

    assert.equal(response.status, 200)
    let html = await response.text()
    assert.match(
      html,
      /Compare websites side by side\./,
    )
    assert.match(
      html,
      /Each choice builds a ranking stored only in this browser\./,
    )
    assert.doesNotMatch(html, /class="app-header"/)
    assert.doesNotMatch(html, /—/)
    assert.match(html, /data-home-divider/)
    assert.match(html, /Drag the divider to inspect both sites/)
    assert.match(html, /studio\.test/)
    assert.match(html, /fieldnotes\.test/)
    assert.match(html, />Demo</)
    assert.match(html, /34 personal sites/)
    assert.match(html, /Library backup/)
    assert.match(html, /Restore backup/)
    assert.match(html, /https:\/\/rsms\.me\/inter\/inter\.css/)
    assert.match(html, /InterVariable/)
    assert.doesNotMatch(html, /A quieter way to decide/)
  })

  it('renders collection views without knowing their contents', async () => {
    let collectionId = 'local-collection-id'
    for (let href of [
      routes.collections.show.href({ collectionId }),
      routes.collections.compare.href({ collectionId }),
      routes.collections.ranking.href({ collectionId }),
    ]) {
      let response = await createAppRouter().fetch(new URL(href, origin))
      assert.equal(response.status, 200)
      let html = await response.text()
      assert.match(html, new RegExp(collectionId))
      assert.doesNotMatch(html, /class="app-header"/)
      assert.doesNotMatch(html, /normalizedUrl|inputUrl|https:\/\/example\.com/)
    }
  })

  it('has no server endpoint that accepts imported URLs', async () => {
    let formData = new FormData()
    formData.set('urls', 'https://private.example')

    let response = await createAppRouter().fetch(
      new Request(new URL('/collections', origin), { method: 'POST', body: formData }),
    )

    assert.equal(response.status, 404)
  })
})
