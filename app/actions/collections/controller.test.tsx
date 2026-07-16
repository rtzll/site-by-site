import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { initializeDatabase } from '../../data/setup.ts'
import { createAppRouter } from '../../router.ts'
import { routes } from '../../routes.ts'

await initializeDatabase()
const origin = 'https://site-by-site.test'

describe('collection import routes', () => {
  it('renders the import page', async () => {
    let response = await createAppRouter().fetch(new URL(routes.home.href(), origin))
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Rank the websites that stay with you/)
  })

  it('creates a pasted collection and redirects to preparation', async () => {
    let formData = new FormData()
    formData.set('name', 'Reference sites')
    formData.set('urls', 'https://one.test\nhttps://two.test')

    let response = await createAppRouter().fetch(
      new Request(new URL(routes.collections.create.href(), origin), {
        method: 'POST',
        body: formData,
      }),
    )

    assert.equal(response.status, 303)
    assert.match(response.headers.get('Location') ?? '', /^\/collections\/[\w-]+\/prepare$/)
  })

  it('discovers folders in an uploaded bookmarks file', async () => {
    let formData = new FormData()
    formData.set(
      'bookmarks',
      new File(
        [
          '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><H3>Typography</H3>',
          '<DL><DT><A HREF="https://type.test">Type</A></DL></DL>',
        ],
        'bookmarks.html',
        { type: 'text/html' },
      ),
    )

    let response = await createAppRouter().fetch(
      new Request(new URL(routes.collections.inspectBookmarks.href(), origin), {
        method: 'POST',
        body: formData,
      }),
    )

    assert.equal(response.status, 200)
    let html = await response.text()
    assert.match(html, /Choose a folder/)
    assert.match(html, /Typography/)
    assert.match(html, /1 site/)
  })
})
