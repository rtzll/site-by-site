import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { pairKey, selectPair, type RankedWebsite } from './pair-selector.ts'

const sites: RankedWebsite[] = [
  { id: 'a', rating: 1510, comparisons: 0 },
  { id: 'b', rating: 1500, comparisons: 4 },
  { id: 'c', rating: 1490, comparisons: 4 },
]

describe('pair selection', () => {
  it('prioritizes an under-exposed site', () => {
    let pair = selectPair(sites, new Set(), () => 0.5)
    assert.ok(pair)
    assert.ok(pair.websiteAId === 'a' || pair.websiteBId === 'a')
  })

  it('avoids recent pairs when another pair is available', () => {
    let pair = selectPair(sites, new Set([pairKey('a', 'b')]), () => 0.5)
    assert.ok(pair)
    assert.notEqual(pairKey(pair.websiteAId, pair.websiteBId), pairKey('a', 'b'))
  })

  it('returns null with fewer than two sites', () => {
    assert.equal(
      selectPair(sites.slice(0, 1), new Set(), () => 0.5),
      null,
    )
  })
})
