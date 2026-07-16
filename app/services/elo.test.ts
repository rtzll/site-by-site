import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { updateElo } from './elo.ts'

describe('Elo updates', () => {
  it('moves new equally-rated sites by twenty points', () => {
    assert.deepEqual(updateElo(1500, 1500, 0, 0), { winner: 1520, loser: 1480 })
  })

  it('reduces volatility after enough comparisons', () => {
    let early = updateElo(1500, 1500, 1, 1)
    let established = updateElo(1500, 1500, 20, 20)
    assert.ok(early.winner - 1500 > established.winner - 1500)
  })
})
