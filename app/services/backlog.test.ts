import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { sqlite, initializeDatabase } from '../data/setup.ts'
import { createCollectionWithImport, getRankedWebsites } from '../data/store.ts'
import { extractUrls } from '../utils/urls.ts'
import { fillBacklog, getOrActivateCurrentPair, recordVote } from './backlog.ts'

await initializeDatabase()

describe('persisted comparison backlog', () => {
  it('activates one pair, records a vote, and updates rankings', () => {
    let { collectionId } = createCollectionWithImport(
      'Test sites',
      'paste',
      extractUrls('https://one.test https://two.test'),
    )
    sqlite
      .prepare(`update websites set embed_status = 'allowed', final_url = normalized_url where collection_id = ?`)
      .run(collectionId)

    assert.equal(fillBacklog(collectionId), 1)
    let pair = getOrActivateCurrentPair(collectionId)
    assert.ok(pair)

    let nextPair = recordVote(collectionId, pair.id, 'left')
    assert.ok(nextPair)

    let ranked = getRankedWebsites(collectionId)
    assert.equal(ranked[0]?.id, pair.left.id)
    assert.equal(ranked[0]?.wins, 1)
    assert.equal(ranked[1]?.losses, 1)
  })
})
