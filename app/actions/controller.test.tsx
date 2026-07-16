import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createAppRouter } from '../router.ts'
import { routes } from '../routes.ts'

const origin = 'https://site-by-site.test'

describe('local-first application routes', () => {
  it('renders the browser-owned import shell', async () => {
    let response = await createAppRouter().fetch(new URL(routes.home.href(), origin))

    assert.equal(response.status, 200)
    let html = await response.text()
    assert.match(html, /Rank the websites that stay with you/)
    assert.match(html, /stored only in this browser/i)
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
