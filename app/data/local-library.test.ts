import 'fake-indexeddb/auto'

import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { openLocalLibrary } from './local-library.ts'

describe('LocalLibrary', () => {
  it('creates a persistent collection without requiring a name', async () => {
    let databaseName = `site-by-site-test-${crypto.randomUUID()}`
    let library = await openLocalLibrary({ databaseName, random: () => 0 })

    let collection = await library.createCollection({
      sourceType: 'paste',
      websites: [
        { inputUrl: 'example.com', normalizedUrl: 'https://example.com/', domain: 'example.com' },
        { inputUrl: 'https://example.com', normalizedUrl: 'https://example.com/', domain: 'example.com' },
        { inputUrl: 'https://remix.run', normalizedUrl: 'https://remix.run/', domain: 'remix.run' },
      ],
    })

    assert.equal(collection.name, 'Untitled collection')
    assert.equal(collection.websiteCount, 2)

    let reopened = await openLocalLibrary({ databaseName, random: () => 0 })
    assert.deepEqual(await reopened.getCollection(collection.id), collection)
  })

  it('keeps the current pair across reads and records a choice atomically', async () => {
    let library = await openLocalLibrary({
      databaseName: `site-by-site-test-${crypto.randomUUID()}`,
      random: () => 0,
    })
    let collection = await library.createCollection({
      name: 'References',
      sourceType: 'paste',
      websites: [
        { inputUrl: 'https://a.test', normalizedUrl: 'https://a.test/', domain: 'a.test' },
        { inputUrl: 'https://b.test', normalizedUrl: 'https://b.test/', domain: 'b.test' },
        { inputUrl: 'https://c.test', normalizedUrl: 'https://c.test/', domain: 'c.test' },
      ],
    })

    let pair = await library.getNextPair(collection.id)
    assert.ok(pair)
    assert.deepEqual(await library.getNextPair(collection.id), pair)

    await library.recordChoice({ collectionId: collection.id, pairId: pair!.id, choice: 'left' })

    let ranking = await library.getRanking(collection.id)
    assert.deepEqual(
      pickRankingFields(ranking[0]!),
      { id: pair.left.id, rating: 1020, wins: 1, losses: 0, comparisons: 1 },
    )
    assert.deepEqual(
      pickRankingFields(ranking.find((site) => site.id === pair.right.id)!),
      { id: pair.right.id, rating: 980, wins: 0, losses: 1, comparisons: 1 },
    )
    assert.equal((await library.getCollection(collection.id))?.comparisonCount, 1)
    assert.notEqual((await library.getNextPair(collection.id))?.id, pair.id)
  })

  it('marks a failed site locally and excludes it from later pairs', async () => {
    let library = await openLocalLibrary({
      databaseName: `site-by-site-test-${crypto.randomUUID()}`,
      random: () => 0,
    })
    let collection = await library.createCollection({
      sourceType: 'paste',
      websites: [
        { inputUrl: 'https://a.test', normalizedUrl: 'https://a.test/', domain: 'a.test' },
        { inputUrl: 'https://b.test', normalizedUrl: 'https://b.test/', domain: 'b.test' },
        { inputUrl: 'https://c.test', normalizedUrl: 'https://c.test/', domain: 'c.test' },
      ],
    })
    let pair = await library.getNextPair(collection.id)

    let replacement = await library.markSiteUnavailable({
      collectionId: collection.id,
      pairId: pair!.id,
      websiteId: pair!.left.id,
    })

    assert.ok(pair)
    assert.ok(replacement)
    assert.ok(![replacement.left.id, replacement.right.id].includes(pair.left.id))
    let summary = await library.getCollection(collection.id)
    assert.equal(summary?.availableCount, 2)
    assert.equal(summary?.unavailableCount, 1)
  })

  it('only marks a website from the current pair unavailable', async () => {
    let library = await openLocalLibrary({
      databaseName: `site-by-site-test-${crypto.randomUUID()}`,
      random: () => 0,
    })
    let collection = await library.createCollection({
      sourceType: 'paste',
      websites: [
        { inputUrl: 'https://a.test', normalizedUrl: 'https://a.test/', domain: 'a.test' },
        { inputUrl: 'https://b.test', normalizedUrl: 'https://b.test/', domain: 'b.test' },
        { inputUrl: 'https://c.test', normalizedUrl: 'https://c.test/', domain: 'c.test' },
      ],
    })
    let pair = await library.getNextPair(collection.id)
    assert.ok(pair)
    let outsideSite = (await library.getRanking(collection.id)).find(
      (site) => ![pair.left.id, pair.right.id].includes(site.id),
    )
    assert.ok(outsideSite)

    await assert.rejects(
      library.markSiteUnavailable({
        collectionId: collection.id,
        pairId: pair.id,
        websiteId: outsideSite.id,
      }),
      /current comparison/,
    )
  })
})

function pickRankingFields(site: {
  id: string
  rating: number
  wins: number
  losses: number
  comparisons: number
}) {
  return {
    id: site.id,
    rating: site.rating,
    wins: site.wins,
    losses: site.losses,
    comparisons: site.comparisons,
  }
}
