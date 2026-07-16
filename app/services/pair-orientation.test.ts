import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import type { ComparisonPair } from '../data/local-library.ts'
import { orientPair, translateVisibleChoice } from './pair-orientation.ts'

const pair: ComparisonPair = {
  id: 'pair-1',
  left: { id: 'site-a', url: 'https://a.example', domain: 'a.example', title: null },
  right: { id: 'site-b', url: 'https://b.example', domain: 'b.example', title: null },
}

describe('pair orientation', () => {
  it('swaps the visible sides without changing the pair', () => {
    assert.deepEqual(orientPair(pair, true), {
      ...pair,
      left: pair.right,
      right: pair.left,
    })
    assert.equal(orientPair(pair, false), pair)
  })

  it('translates visible choices back to their stored sides', () => {
    assert.equal(translateVisibleChoice('left', true), 'right')
    assert.equal(translateVisibleChoice('right', true), 'left')
    assert.equal(translateVisibleChoice('skip', true), 'skip')
    assert.equal(translateVisibleChoice('left', false), 'left')
  })
})
