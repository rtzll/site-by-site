import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { demoWebsiteUrls } from './demo-websites.ts'
import { extractUrls } from '../utils/urls.ts'

describe('bundled demo websites', () => {
  it('contains the 34 unique ready sites from the Personal Sites export', () => {
    let websites = extractUrls(demoWebsiteUrls.join('\n'))

    assert.equal(demoWebsiteUrls.length, 34)
    assert.equal(websites.length, 34)
    assert.ok(websites.every((website) => website.normalizedUrl.startsWith('https://')))
  })
})
