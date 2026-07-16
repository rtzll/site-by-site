import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { extractUrls, normalizeUrl } from './urls.ts'

describe('URL importing', () => {
  it('extracts URLs from prose, markdown, and bare domains', () => {
    let urls = extractUrls(`
      Alpha https://Example.com/path#section
      [Beta](https://beta.test/work?view=all)
      Gamma: www.gamma.test, and gamma.test.
      Duplicate https://example.com/path
    `)

    assert.deepEqual(
      urls.map((url) => url.normalizedUrl),
      [
        'https://example.com/path',
        'https://beta.test/work?view=all',
        'https://www.gamma.test/',
        'https://gamma.test/',
      ],
    )
  })

  it('rejects unsafe protocols and credentials', () => {
    assert.equal(normalizeUrl('javascript:alert(1)'), null)
    assert.equal(normalizeUrl('https://name:secret@example.com'), null)
  })
})
