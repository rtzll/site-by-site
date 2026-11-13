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
        {
          inputUrl: 'https://example.com',
          normalizedUrl: 'https://example.com/',
          domain: 'example.com',
        },
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
    assert.deepEqual(pickRankingFields(ranking[0]!), {
      id: pair.left.id,
      rating: 1020,
      wins: 1,
      losses: 0,
      comparisons: 1,
    })
    assert.deepEqual(pickRankingFields(ranking.find((site) => site.id === pair.right.id)!), {
      id: pair.right.id,
      rating: 980,
      wins: 0,
      losses: 1,
      comparisons: 1,
    })
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

  it('undoes a vote and restores the exact previous pair', async () => {
    let library = await createThreeSiteLibrary()
    let collection = (await library.listCollections())[0]!
    let pair = await library.getNextPair(collection.id)
    assert.ok(pair)

    await library.recordChoice({ collectionId: collection.id, pairId: pair.id, choice: 'left' })
    await library.getNextPair(collection.id)
    assert.equal((await library.getCollection(collection.id))?.canUndoLastAction, true)

    assert.deepEqual(await library.undoLastAction(collection.id), pair)
    let ranking = await library.getRanking(collection.id)
    assert.deepEqual(
      ranking.map(pickComparisonFields),
      ranking.map((website) => ({
        id: website.id,
        rating: 1000,
        comparisons: 0,
        wins: 0,
        losses: 0,
        skips: 0,
        status: 'ready',
      })),
    )
    let restored = await library.getCollection(collection.id)
    assert.equal(restored?.comparisonCount, 0)
    assert.equal(restored?.canUndoLastAction, false)
    assert.deepEqual(await library.getNextPair(collection.id), pair)
    assert.equal(await library.undoLastAction(collection.id), null)
  })

  it('persists the undo snapshot when the library is reopened', async () => {
    let databaseName = `site-by-site-test-${crypto.randomUUID()}`
    let library = await openLocalLibrary({ databaseName, random: () => 0 })
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
    await library.recordChoice({ collectionId: collection.id, pairId: pair.id, choice: 'right' })
    await library.getNextPair(collection.id)

    let reopened = await openLocalLibrary({ databaseName, random: () => 0 })
    assert.equal((await reopened.getCollection(collection.id))?.canUndoLastAction, true)
    assert.deepEqual(await reopened.undoLastAction(collection.id), pair)
    assert.equal((await reopened.getCollection(collection.id))?.comparisonCount, 0)
  })

  it('undoes a skipped comparison', async () => {
    let library = await createThreeSiteLibrary()
    let collection = (await library.listCollections())[0]!
    let pair = await library.getNextPair(collection.id)
    assert.ok(pair)

    await library.recordChoice({ collectionId: collection.id, pairId: pair.id, choice: 'skip' })
    await library.getNextPair(collection.id)
    assert.deepEqual(await library.undoLastAction(collection.id), pair)

    let restoredSites = await library.getRanking(collection.id)
    assert.equal(
      restoredSites.every((website) => website.comparisons === 0),
      true,
    )
    assert.equal(
      restoredSites.every((website) => website.skips === 0),
      true,
    )
    assert.equal((await library.getCollection(collection.id))?.comparisonCount, 0)
  })

  it('undoes an unavailable-site action', async () => {
    let library = await createThreeSiteLibrary()
    let collection = (await library.listCollections())[0]!
    let pair = await library.getNextPair(collection.id)
    assert.ok(pair)

    await library.markSiteUnavailable({
      collectionId: collection.id,
      pairId: pair.id,
      websiteId: pair.left.id,
    })
    assert.equal((await library.getCollection(collection.id))?.unavailableCount, 1)

    assert.deepEqual(await library.undoLastAction(collection.id), pair)
    let restored = await library.getCollection(collection.id)
    assert.equal(restored?.availableCount, 3)
    assert.equal(restored?.unavailableCount, 0)
    assert.deepEqual(await library.getNextPair(collection.id), pair)
  })

  it('restores a two-site comparison after unavailable leaves no next pair', async () => {
    let library = await openLocalLibrary({
      databaseName: `site-by-site-test-${crypto.randomUUID()}`,
      random: () => 0,
    })
    let collection = await library.createCollection({
      sourceType: 'paste',
      websites: [
        { inputUrl: 'https://a.test', normalizedUrl: 'https://a.test/', domain: 'a.test' },
        { inputUrl: 'https://b.test', normalizedUrl: 'https://b.test/', domain: 'b.test' },
      ],
    })
    let pair = await library.getNextPair(collection.id)
    assert.ok(pair)

    assert.equal(
      await library.markSiteUnavailable({
        collectionId: collection.id,
        pairId: pair.id,
        websiteId: pair.left.id,
      }),
      null,
    )
    assert.deepEqual(await library.undoLastAction(collection.id), pair)
  })

  it('round-trips the full library through a backup and replaces existing data', async () => {
    let now = () => Date.parse('2026-07-19T12:00:00.000Z')
    let source = await openLocalLibrary({
      databaseName: `site-by-site-test-${crypto.randomUUID()}`,
      random: () => 0,
      now,
    })
    let sourceCollection = await source.createCollection({
      name: 'Reference sites',
      sourceType: 'paste',
      websites: [
        { inputUrl: 'https://a.test', normalizedUrl: 'https://a.test/', domain: 'a.test' },
        { inputUrl: 'https://b.test', normalizedUrl: 'https://b.test/', domain: 'b.test' },
        { inputUrl: 'https://c.test', normalizedUrl: 'https://c.test/', domain: 'c.test' },
      ],
    })
    let firstPair = await source.getNextPair(sourceCollection.id)
    assert.ok(firstPair)
    await source.recordChoice({
      collectionId: sourceCollection.id,
      pairId: firstPair.id,
      choice: 'left',
    })
    let currentPair = await source.getNextPair(sourceCollection.id)
    assert.ok(currentPair)
    let backup = await source.exportData()
    assert.equal('lastComparisonAction' in backup.collections[0]!, false)

    let target = await openLocalLibrary({
      databaseName: `site-by-site-test-${crypto.randomUUID()}`,
      random: () => 0,
      now,
    })
    let staleCollection = await target.createCollection({
      name: 'Replace me',
      sourceType: 'paste',
      websites: [
        { inputUrl: 'https://x.test', normalizedUrl: 'https://x.test/', domain: 'x.test' },
        { inputUrl: 'https://y.test', normalizedUrl: 'https://y.test/', domain: 'y.test' },
      ],
    })

    assert.deepEqual(await target.restoreData(backup), {
      collectionCount: 1,
      websiteCount: 3,
      comparisonCount: 1,
    })
    assert.equal(await target.getCollection(staleCollection.id), null)
    assert.deepEqual(
      await target.getRanking(sourceCollection.id),
      await source.getRanking(sourceCollection.id),
    )
    assert.deepEqual(await target.getNextPair(sourceCollection.id), currentPair)
    let restoredCollection = await target.getCollection(sourceCollection.id)
    assert.equal(restoredCollection?.name, 'Reference sites')
    assert.equal(restoredCollection?.comparisonCount, 1)
    assert.equal(restoredCollection?.canUndoLastAction, false)
    assert.deepEqual(await target.exportData(), backup)
  })

  it('rejects invalid backups without changing the existing library', async () => {
    let now = () => Date.parse('2026-07-19T12:00:00.000Z')
    let library = await openLocalLibrary({
      databaseName: `site-by-site-test-${crypto.randomUUID()}`,
      random: () => 0,
      now,
    })
    await library.createCollection({
      name: 'Keep me',
      sourceType: 'paste',
      websites: [
        { inputUrl: 'https://a.test', normalizedUrl: 'https://a.test/', domain: 'a.test' },
        { inputUrl: 'https://b.test', normalizedUrl: 'https://b.test/', domain: 'b.test' },
      ],
    })
    let before = await library.exportData()

    await assert.rejects(library.restoreData({ ...before, version: 2 }), /version is not supported/)
    assert.deepEqual(await library.exportData(), before)

    let damaged = structuredClone(before)
    damaged.websites[0]!.collectionId = 'missing-collection'
    await assert.rejects(library.restoreData(damaged), /damaged or incomplete/)
    assert.deepEqual(await library.exportData(), before)
  })
})

async function createThreeSiteLibrary() {
  let library = await openLocalLibrary({
    databaseName: `site-by-site-test-${crypto.randomUUID()}`,
    random: () => 0,
  })
  await library.createCollection({
    sourceType: 'paste',
    websites: [
      { inputUrl: 'https://a.test', normalizedUrl: 'https://a.test/', domain: 'a.test' },
      { inputUrl: 'https://b.test', normalizedUrl: 'https://b.test/', domain: 'b.test' },
      { inputUrl: 'https://c.test', normalizedUrl: 'https://c.test/', domain: 'c.test' },
    ],
  })
  return library
}

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

function pickComparisonFields(site: {
  id: string
  rating: number
  comparisons: number
  wins: number
  losses: number
  skips: number
  status: 'ready' | 'unavailable'
}) {
  return {
    id: site.id,
    rating: site.rating,
    comparisons: site.comparisons,
    wins: site.wins,
    losses: site.losses,
    skips: site.skips,
    status: site.status,
  }
}
