import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { classifyEmbedHeaders } from './embed-check.ts'

describe('embed header classification', () => {
  it('blocks frame-ancestors none and same-origin-only policies', () => {
    assert.equal(
      classifyEmbedHeaders(new Headers({ 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'" })).status,
      'blocked',
    )
    assert.equal(
      classifyEmbedHeaders(new Headers({ 'X-Frame-Options': 'SAMEORIGIN' })).status,
      'blocked',
    )
  })

  it('allows pages without frame restrictions and marks source lists conditional', () => {
    assert.equal(classifyEmbedHeaders(new Headers()).status, 'allowed')
    assert.equal(
      classifyEmbedHeaders(
        new Headers({ 'Content-Security-Policy': 'frame-ancestors https://example.test https:' }),
      ).status,
      'conditional',
    )
  })
})
