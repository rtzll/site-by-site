import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import { updateElo } from '../services/elo.ts'
import { pairKey, selectPair } from '../services/pair-selector.ts'
import type { ImportedUrl } from '../utils/urls.ts'

export type SourceType = 'bookmarks' | 'paste'
export type VoteChoice = 'left' | 'right' | 'skip'

export interface CollectionSummary {
  id: string
  name: string
  sourceType: SourceType
  websiteCount: number
  availableCount: number
  unavailableCount: number
  comparisonCount: number
  createdAt: number
  updatedAt: number
}

export interface WebsiteRecord {
  id: string
  collectionId: string
  inputUrl: string
  normalizedUrl: string
  domain: string
  title: string | null
  status: 'ready' | 'unavailable'
  rating: number
  comparisons: number
  wins: number
  losses: number
  skips: number
  createdAt: number
  updatedAt: number
}

export interface ComparisonWebsite {
  id: string
  url: string
  domain: string
  title: string | null
}

export interface ComparisonPair {
  id: string
  left: ComparisonWebsite
  right: ComparisonWebsite
}

export interface LocalLibraryExport {
  format: 'site-by-site-library'
  version: 1
  exportedAt: string
  collections: CollectionRecord[]
  websites: WebsiteRecord[]
  comparisons: ComparisonRecord[]
}

export interface LocalLibrary {
  createCollection(input: {
    name?: string
    sourceType: SourceType
    websites: ImportedUrl[]
  }): Promise<CollectionSummary>
  addWebsites(collectionId: string, websites: ImportedUrl[]): Promise<CollectionSummary | null>
  renameCollection(collectionId: string, name: string): Promise<CollectionSummary | null>
  listCollections(): Promise<CollectionSummary[]>
  getCollection(collectionId: string): Promise<CollectionSummary | null>
  getNextPair(collectionId: string): Promise<ComparisonPair | null>
  recordChoice(input: {
    collectionId: string
    pairId: string
    choice: VoteChoice
  }): Promise<void>
  markSiteUnavailable(input: {
    collectionId: string
    pairId: string
    websiteId: string
  }): Promise<ComparisonPair | null>
  getRanking(collectionId: string): Promise<WebsiteRecord[]>
  exportData(): Promise<LocalLibraryExport>
}

interface CurrentPair {
  id: string
  leftWebsiteId: string
  rightWebsiteId: string
}

interface CollectionRecord {
  id: string
  name: string
  sourceType: SourceType
  currentPair: CurrentPair | null
  createdAt: number
  updatedAt: number
}

interface ComparisonRecord {
  id: string
  collectionId: string
  pairKey: string
  leftWebsiteId: string
  rightWebsiteId: string
  choice: VoteChoice
  winnerWebsiteId: string | null
  createdAt: number
}

interface SiteBySiteDatabase extends DBSchema {
  collections: {
    key: string
    value: CollectionRecord
    indexes: { 'by-updated-at': number }
  }
  websites: {
    key: string
    value: WebsiteRecord
    indexes: {
      'by-collection': string
      'by-collection-url': [string, string]
    }
  }
  comparisons: {
    key: string
    value: ComparisonRecord
    indexes: {
      'by-collection': string
      'by-collection-created-at': [string, number]
    }
  }
}

interface LocalLibraryOptions {
  databaseName?: string
  random?: () => number
  createId?: () => string
  now?: () => number
}

const defaultDatabaseName = 'site-by-site'

export async function openLocalLibrary(
  options: LocalLibraryOptions = {},
): Promise<LocalLibrary> {
  let database = await openDB<SiteBySiteDatabase>(options.databaseName ?? defaultDatabaseName, 1, {
    upgrade(db) {
      let collections = db.createObjectStore('collections', { keyPath: 'id' })
      collections.createIndex('by-updated-at', 'updatedAt')

      let websites = db.createObjectStore('websites', { keyPath: 'id' })
      websites.createIndex('by-collection', 'collectionId')
      websites.createIndex('by-collection-url', ['collectionId', 'normalizedUrl'], { unique: true })

      let comparisons = db.createObjectStore('comparisons', { keyPath: 'id' })
      comparisons.createIndex('by-collection', 'collectionId')
      comparisons.createIndex('by-collection-created-at', ['collectionId', 'createdAt'])
    },
    blocking() {
      database.close()
    },
  })

  return new IndexedDbLocalLibrary(
    database,
    options.random ?? Math.random,
    options.createId ?? (() => crypto.randomUUID()),
    options.now ?? Date.now,
  )
}

class IndexedDbLocalLibrary implements LocalLibrary {
  constructor(
    private readonly database: IDBPDatabase<SiteBySiteDatabase>,
    private readonly random: () => number,
    private readonly createId: () => string,
    private readonly now: () => number,
  ) {}

  async createCollection(input: {
    name?: string
    sourceType: SourceType
    websites: ImportedUrl[]
  }): Promise<CollectionSummary> {
    let id = this.createId()
    let timestamp = this.now()
    let uniqueWebsites = uniqueByUrl(input.websites)
    let collection: CollectionRecord = {
      id,
      name: await this.collectionName(input.name),
      sourceType: input.sourceType,
      currentPair: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    let transaction = this.database.transaction(['collections', 'websites'], 'readwrite')
    await transaction.objectStore('collections').add(collection)
    await Promise.all(
      uniqueWebsites.map((website) =>
        transaction.objectStore('websites').add(newWebsite(id, website, timestamp, this.createId)),
      ),
    )
    await transaction.done
    return (await this.getCollection(id))!
  }

  async addWebsites(
    collectionId: string,
    websites: ImportedUrl[],
  ): Promise<CollectionSummary | null> {
    let transaction = this.database.transaction(['collections', 'websites'], 'readwrite')
    let collection = await transaction.objectStore('collections').get(collectionId)
    if (!collection) {
      return null
    }

    let timestamp = this.now()
    let websiteStore = transaction.objectStore('websites')
    let urlIndex = websiteStore.index('by-collection-url')
    for (let website of uniqueByUrl(websites)) {
      let existing = await urlIndex.getKey([collectionId, website.normalizedUrl])
      if (!existing) await websiteStore.add(newWebsite(collectionId, website, timestamp, this.createId))
    }
    collection.updatedAt = timestamp
    await transaction.objectStore('collections').put(collection)
    await transaction.done
    return this.getCollection(collectionId)
  }

  async renameCollection(collectionId: string, name: string): Promise<CollectionSummary | null> {
    let collection = await this.database.get('collections', collectionId)
    let trimmedName = name.trim().slice(0, 80)
    if (!collection || !trimmedName) return null
    collection.name = trimmedName
    collection.updatedAt = this.now()
    await this.database.put('collections', collection)
    return this.getCollection(collectionId)
  }

  async listCollections(): Promise<CollectionSummary[]> {
    let collections = await this.database.getAll('collections')
    return Promise.all(
      collections
        .toSorted((left, right) => right.updatedAt - left.updatedAt)
        .map((collection) => this.summarize(collection)),
    )
  }

  async getCollection(collectionId: string): Promise<CollectionSummary | null> {
    let collection = await this.database.get('collections', collectionId)
    return collection ? this.summarize(collection) : null
  }

  async getNextPair(collectionId: string): Promise<ComparisonPair | null> {
    let transaction = this.database.transaction(
      ['collections', 'websites', 'comparisons'],
      'readwrite',
    )
    let collectionStore = transaction.objectStore('collections')
    let websiteStore = transaction.objectStore('websites')
    let collection = await collectionStore.get(collectionId)
    if (!collection) {
      return null
    }

    if (collection.currentPair) {
      let pair = await hydratePair(collection.currentPair, websiteStore)
      if (pair) {
        await transaction.done
        return pair
      }
      collection.currentPair = null
    }

    let websites = (await websiteStore.index('by-collection').getAll(collectionId)).filter(
      (website) => website.status === 'ready',
    )
    let comparisons = await transaction
      .objectStore('comparisons')
      .index('by-collection')
      .getAll(collectionId)
    let recentPairKeys = new Set(
      comparisons
        .toSorted((left, right) => right.createdAt - left.createdAt)
        .slice(0, 12)
        .map((comparison) => comparison.pairKey),
    )
    let selected = selectPair(websites, recentPairKeys, this.random)
    if (!selected) {
      await collectionStore.put(collection)
      await transaction.done
      return null
    }

    collection.currentPair = {
      id: this.createId(),
      leftWebsiteId: selected.leftWebsiteId,
      rightWebsiteId: selected.rightWebsiteId,
    }
    collection.updatedAt = this.now()
    await collectionStore.put(collection)
    let pair = await hydratePair(collection.currentPair, websiteStore)
    await transaction.done
    return pair
  }

  async recordChoice(input: {
    collectionId: string
    pairId: string
    choice: VoteChoice
  }): Promise<void> {
    let transaction = this.database.transaction(
      ['collections', 'websites', 'comparisons'],
      'readwrite',
    )
    let collectionStore = transaction.objectStore('collections')
    let websiteStore = transaction.objectStore('websites')
    let collection = await collectionStore.get(input.collectionId)
    if (!collection?.currentPair || collection.currentPair.id !== input.pairId) {
      throw new Error('This comparison is no longer current.')
    }

    let left = await websiteStore.get(collection.currentPair.leftWebsiteId)
    let right = await websiteStore.get(collection.currentPair.rightWebsiteId)
    if (!left || !right) {
      throw new Error('A website in this comparison no longer exists.')
    }

    let winnerWebsiteId: string | null = null
    if (input.choice === 'skip') {
      left.skips++
      right.skips++
    } else {
      let winner = input.choice === 'left' ? left : right
      let loser = input.choice === 'left' ? right : left
      let ratings = updateElo(winner.rating, loser.rating, winner.comparisons, loser.comparisons)
      winner.rating = ratings.winner
      loser.rating = ratings.loser
      winner.wins++
      loser.losses++
      winnerWebsiteId = winner.id
    }

    let timestamp = this.now()
    left.comparisons++
    right.comparisons++
    left.updatedAt = timestamp
    right.updatedAt = timestamp
    await Promise.all([websiteStore.put(left), websiteStore.put(right)])
    await transaction.objectStore('comparisons').add({
      id: this.createId(),
      collectionId: collection.id,
      pairKey: pairKey(left.id, right.id),
      leftWebsiteId: left.id,
      rightWebsiteId: right.id,
      choice: input.choice,
      winnerWebsiteId,
      createdAt: timestamp,
    })
    collection.currentPair = null
    collection.updatedAt = timestamp
    await collectionStore.put(collection)
    await transaction.done
  }

  async markSiteUnavailable(input: {
    collectionId: string
    pairId: string
    websiteId: string
  }): Promise<ComparisonPair | null> {
    let transaction = this.database.transaction(['collections', 'websites'], 'readwrite')
    let collectionStore = transaction.objectStore('collections')
    let websiteStore = transaction.objectStore('websites')
    let collection = await collectionStore.get(input.collectionId)
    let website = await websiteStore.get(input.websiteId)
    if (!collection || !website || website.collectionId !== collection.id) {
      return null
    }
    if (collection.currentPair?.id !== input.pairId) {
      throw new Error('This comparison is no longer current.')
    }
    if (
      ![
        collection.currentPair.leftWebsiteId,
        collection.currentPair.rightWebsiteId,
      ].includes(website.id)
    ) {
      throw new Error('That website is not part of the current comparison.')
    }

    let timestamp = this.now()
    website.status = 'unavailable'
    website.updatedAt = timestamp
    collection.currentPair = null
    collection.updatedAt = timestamp
    await Promise.all([websiteStore.put(website), collectionStore.put(collection)])
    await transaction.done
    return this.getNextPair(collection.id)
  }

  async getRanking(collectionId: string): Promise<WebsiteRecord[]> {
    let websites = await this.database.getAllFromIndex('websites', 'by-collection', collectionId)
    return websites.toSorted((left, right) => {
      if (left.status !== right.status) return left.status === 'ready' ? -1 : 1
      return (
        right.rating - left.rating ||
        right.wins - left.wins ||
        right.comparisons - left.comparisons ||
        left.domain.localeCompare(right.domain)
      )
    })
  }

  async exportData(): Promise<LocalLibraryExport> {
    let transaction = this.database.transaction(['collections', 'websites', 'comparisons'])
    let [collections, websites, comparisons] = await Promise.all([
      transaction.objectStore('collections').getAll(),
      transaction.objectStore('websites').getAll(),
      transaction.objectStore('comparisons').getAll(),
    ])
    await transaction.done
    return {
      format: 'site-by-site-library',
      version: 1,
      exportedAt: new Date(this.now()).toISOString(),
      collections,
      websites,
      comparisons,
    }
  }

  private async summarize(collection: CollectionRecord): Promise<CollectionSummary> {
    let transaction = this.database.transaction(['websites', 'comparisons'])
    let [websites, comparisonCount] = await Promise.all([
      transaction.objectStore('websites').index('by-collection').getAll(collection.id),
      transaction.objectStore('comparisons').index('by-collection').count(collection.id),
    ])
    await transaction.done
    let availableCount = websites.filter((website) => website.status === 'ready').length
    return {
      id: collection.id,
      name: collection.name,
      sourceType: collection.sourceType,
      websiteCount: websites.length,
      availableCount,
      unavailableCount: websites.length - availableCount,
      comparisonCount,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    }
  }

  private async collectionName(requestedName: string | undefined): Promise<string> {
    let trimmedName = requestedName?.trim().slice(0, 80)
    if (trimmedName) return trimmedName
    let collections = await this.database.getAll('collections')
    let names = new Set(collections.map((collection) => collection.name))
    if (!names.has('Untitled collection')) return 'Untitled collection'
    let index = 2
    while (names.has(`Untitled collection ${index}`)) index++
    return `Untitled collection ${index}`
  }
}

function uniqueByUrl(websites: ImportedUrl[]): ImportedUrl[] {
  return [...new Map(websites.map((website) => [website.normalizedUrl, website])).values()]
}

function newWebsite(
  collectionId: string,
  website: ImportedUrl,
  timestamp: number,
  createId: () => string,
): WebsiteRecord {
  return {
    id: createId(),
    collectionId,
    inputUrl: website.inputUrl,
    normalizedUrl: website.normalizedUrl,
    domain: website.domain,
    title: null,
    status: 'ready',
    rating: 1000,
    comparisons: 0,
    wins: 0,
    losses: 0,
    skips: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

async function hydratePair(
  pair: CurrentPair,
  websiteStore: { get(key: string): Promise<WebsiteRecord | undefined> },
): Promise<ComparisonPair | null> {
  let [left, right] = await Promise.all([
    websiteStore.get(pair.leftWebsiteId),
    websiteStore.get(pair.rightWebsiteId),
  ])
  if (!left || !right || left.status !== 'ready' || right.status !== 'ready') return null
  return {
    id: pair.id,
    left: comparisonWebsite(left),
    right: comparisonWebsite(right),
  }
}

function comparisonWebsite(website: WebsiteRecord): ComparisonWebsite {
  return {
    id: website.id,
    url: website.normalizedUrl,
    domain: website.domain,
    title: website.title,
  }
}
