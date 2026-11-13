import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import { updateElo } from '../services/elo.ts'
import { pairKey, selectPair } from '../services/pair-selector.ts'
import { normalizeUrl, type ImportedUrl } from '../utils/urls.ts'

export type SourceType = 'bookmarks' | 'paste' | 'demo'
export type VoteChoice = 'left' | 'right' | 'skip'

export interface CollectionSummary {
  id: string
  name: string
  sourceType: SourceType
  websiteCount: number
  availableCount: number
  unavailableCount: number
  comparisonCount: number
  canUndoLastAction: boolean
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

export interface LibraryBackupCurrentPair {
  id: string
  leftWebsiteId: string
  rightWebsiteId: string
}

export interface LibraryBackupCollection {
  id: string
  name: string
  sourceType: SourceType
  currentPair: LibraryBackupCurrentPair | null
  createdAt: number
  updatedAt: number
}

export interface LibraryBackupComparison {
  id: string
  collectionId: string
  pairKey: string
  leftWebsiteId: string
  rightWebsiteId: string
  choice: VoteChoice
  winnerWebsiteId: string | null
  createdAt: number
}

export interface LocalLibraryExport {
  format: 'site-by-site-library'
  version: 1
  exportedAt: string
  collections: LibraryBackupCollection[]
  websites: WebsiteRecord[]
  comparisons: LibraryBackupComparison[]
}

export interface RestoreSummary {
  collectionCount: number
  websiteCount: number
  comparisonCount: number
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
  recordChoice(input: { collectionId: string; pairId: string; choice: VoteChoice }): Promise<void>
  markSiteUnavailable(input: {
    collectionId: string
    pairId: string
    websiteId: string
  }): Promise<ComparisonPair | null>
  undoLastAction(collectionId: string): Promise<ComparisonPair | null>
  getRanking(collectionId: string): Promise<WebsiteRecord[]>
  exportData(): Promise<LocalLibraryExport>
  restoreData(value: unknown): Promise<RestoreSummary>
}

type CurrentPair = LibraryBackupCurrentPair

interface CollectionRecord extends LibraryBackupCollection {
  lastComparisonAction?: LastComparisonAction | null
}

type LastComparisonAction =
  | {
      kind: 'choice'
      pair: CurrentPair
      comparisonId: string
      websites: [WebsiteRecord, WebsiteRecord]
    }
  | {
      kind: 'unavailable'
      pair: CurrentPair
      websites: [WebsiteRecord]
    }

type ComparisonRecord = LibraryBackupComparison

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

export async function openLocalLibrary(options: LocalLibraryOptions = {}): Promise<LocalLibrary> {
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
      lastComparisonAction: null,
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
      if (!existing)
        await websiteStore.add(newWebsite(collectionId, website, timestamp, this.createId))
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

    let pair = { ...collection.currentPair }
    let websiteSnapshots: [WebsiteRecord, WebsiteRecord] = [{ ...left }, { ...right }]

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
    let comparisonId = this.createId()
    await transaction.objectStore('comparisons').add({
      id: comparisonId,
      collectionId: collection.id,
      pairKey: pairKey(left.id, right.id),
      leftWebsiteId: left.id,
      rightWebsiteId: right.id,
      choice: input.choice,
      winnerWebsiteId,
      createdAt: timestamp,
    })
    collection.currentPair = null
    collection.lastComparisonAction = {
      kind: 'choice',
      pair,
      comparisonId,
      websites: websiteSnapshots,
    }
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
      ![collection.currentPair.leftWebsiteId, collection.currentPair.rightWebsiteId].includes(
        website.id,
      )
    ) {
      throw new Error('That website is not part of the current comparison.')
    }

    let timestamp = this.now()
    let pair = { ...collection.currentPair }
    let websiteSnapshot = { ...website }
    website.status = 'unavailable'
    website.updatedAt = timestamp
    collection.currentPair = null
    collection.lastComparisonAction = {
      kind: 'unavailable',
      pair,
      websites: [websiteSnapshot],
    }
    collection.updatedAt = timestamp
    await Promise.all([websiteStore.put(website), collectionStore.put(collection)])
    await transaction.done
    return this.getNextPair(collection.id)
  }

  async undoLastAction(collectionId: string): Promise<ComparisonPair | null> {
    let transaction = this.database.transaction(
      ['collections', 'websites', 'comparisons'],
      'readwrite',
    )
    let collectionStore = transaction.objectStore('collections')
    let websiteStore = transaction.objectStore('websites')
    let comparisonStore = transaction.objectStore('comparisons')
    let collection = await collectionStore.get(collectionId)
    let action = collection?.lastComparisonAction
    if (!collection || !action) {
      await transaction.done
      return null
    }

    await Promise.all(action.websites.map((website) => websiteStore.put(website)))
    if (action.kind === 'choice') await comparisonStore.delete(action.comparisonId)

    collection.currentPair = action.pair
    collection.lastComparisonAction = null
    collection.updatedAt = this.now()
    await collectionStore.put(collection)
    let pair = await hydratePair(action.pair, websiteStore)
    await transaction.done
    return pair
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
      collections: collections.map(
        ({ lastComparisonAction: _lastComparisonAction, ...record }) => record,
      ),
      websites,
      comparisons,
    }
  }

  async restoreData(value: unknown): Promise<RestoreSummary> {
    let backup = parseLocalLibraryExport(value)
    let transaction = this.database.transaction(
      ['collections', 'websites', 'comparisons'],
      'readwrite',
    )
    let collectionStore = transaction.objectStore('collections')
    let websiteStore = transaction.objectStore('websites')
    let comparisonStore = transaction.objectStore('comparisons')
    let operations: Promise<unknown>[] = [
      collectionStore.clear(),
      websiteStore.clear(),
      comparisonStore.clear(),
    ]

    operations.push(
      ...backup.collections.map((collection) =>
        collectionStore.add({ ...collection, lastComparisonAction: null }),
      ),
      ...backup.websites.map((website) => websiteStore.add(website)),
      ...backup.comparisons.map((comparison) => comparisonStore.add(comparison)),
    )

    await Promise.all([...operations, transaction.done])
    return {
      collectionCount: backup.collections.length,
      websiteCount: backup.websites.length,
      comparisonCount: backup.comparisons.length,
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
      canUndoLastAction: Boolean(collection.lastComparisonAction),
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

export function parseLocalLibraryExport(value: unknown): LocalLibraryExport {
  if (!isRecord(value) || value.format !== 'site-by-site-library') {
    throw new Error('This is not a Site by Site backup.')
  }
  if (typeof value.version !== 'number') throw damagedBackup()
  if (value.version !== 1) throw new Error('This backup version is not supported.')
  if (
    typeof value.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.exportedAt)) ||
    !Array.isArray(value.collections) ||
    !Array.isArray(value.websites) ||
    !Array.isArray(value.comparisons)
  ) {
    throw damagedBackup()
  }

  let collections = value.collections.map(parseBackupCollection)
  let websites = value.websites.map(parseBackupWebsite)
  let comparisons = value.comparisons.map(parseBackupComparison)
  validateBackupReferences(collections, websites, comparisons)

  return {
    format: 'site-by-site-library',
    version: 1,
    exportedAt: value.exportedAt,
    collections,
    websites,
    comparisons,
  }
}

function parseBackupCollection(value: unknown): LibraryBackupCollection {
  if (!isRecord(value)) throw damagedBackup()
  let id = backupString(value.id)
  let name = backupString(value.name, 80)
  let sourceType = value.sourceType
  if (sourceType !== 'bookmarks' && sourceType !== 'paste' && sourceType !== 'demo') {
    throw damagedBackup()
  }

  let currentPair: LibraryBackupCurrentPair | null = null
  if (value.currentPair !== null) {
    if (!isRecord(value.currentPair)) throw damagedBackup()
    currentPair = {
      id: backupString(value.currentPair.id),
      leftWebsiteId: backupString(value.currentPair.leftWebsiteId),
      rightWebsiteId: backupString(value.currentPair.rightWebsiteId),
    }
  }

  let createdAt = backupInteger(value.createdAt)
  let updatedAt = backupInteger(value.updatedAt)
  if (updatedAt < createdAt) throw damagedBackup()
  return { id, name, sourceType, currentPair, createdAt, updatedAt }
}

function parseBackupWebsite(value: unknown): WebsiteRecord {
  if (!isRecord(value)) throw damagedBackup()
  let status = value.status
  if (status !== 'ready' && status !== 'unavailable') throw damagedBackup()
  let title = value.title
  if (title !== null && typeof title !== 'string') throw damagedBackup()

  let website: WebsiteRecord = {
    id: backupString(value.id),
    collectionId: backupString(value.collectionId),
    inputUrl: backupString(value.inputUrl),
    normalizedUrl: backupString(value.normalizedUrl),
    domain: backupString(value.domain),
    title,
    status,
    rating: backupNumber(value.rating),
    comparisons: backupInteger(value.comparisons),
    wins: backupInteger(value.wins),
    losses: backupInteger(value.losses),
    skips: backupInteger(value.skips),
    createdAt: backupInteger(value.createdAt),
    updatedAt: backupInteger(value.updatedAt),
  }
  let normalizedStoredUrl = normalizeUrl(website.normalizedUrl)
  let normalizedInputUrl = normalizeUrl(website.inputUrl)
  if (
    !normalizedStoredUrl ||
    !normalizedInputUrl ||
    normalizedStoredUrl.normalizedUrl !== website.normalizedUrl ||
    normalizedStoredUrl.domain !== website.domain ||
    normalizedInputUrl.normalizedUrl !== website.normalizedUrl ||
    website.wins + website.losses + website.skips !== website.comparisons ||
    website.updatedAt < website.createdAt
  ) {
    throw damagedBackup()
  }
  return website
}

function parseBackupComparison(value: unknown): LibraryBackupComparison {
  if (!isRecord(value)) throw damagedBackup()
  let choice = value.choice
  if (choice !== 'left' && choice !== 'right' && choice !== 'skip') throw damagedBackup()
  let winnerWebsiteId = value.winnerWebsiteId
  if (winnerWebsiteId !== null && typeof winnerWebsiteId !== 'string') throw damagedBackup()

  return {
    id: backupString(value.id),
    collectionId: backupString(value.collectionId),
    pairKey: backupString(value.pairKey),
    leftWebsiteId: backupString(value.leftWebsiteId),
    rightWebsiteId: backupString(value.rightWebsiteId),
    choice,
    winnerWebsiteId,
    createdAt: backupInteger(value.createdAt),
  }
}

function validateBackupReferences(
  collections: LibraryBackupCollection[],
  websites: WebsiteRecord[],
  comparisons: LibraryBackupComparison[],
) {
  let collectionIds = uniqueRecordMap(collections)
  let websiteIds = uniqueRecordMap(websites)
  uniqueRecordMap(comparisons)
  let collectionUrls = new Set<string>()

  for (let website of websites) {
    if (!collectionIds.has(website.collectionId)) throw damagedBackup()
    let collectionUrl = `${website.collectionId}\u0000${website.normalizedUrl}`
    if (collectionUrls.has(collectionUrl)) throw damagedBackup()
    collectionUrls.add(collectionUrl)
  }

  for (let collection of collections) {
    if (!collection.currentPair) continue
    let left = websiteIds.get(collection.currentPair.leftWebsiteId)
    let right = websiteIds.get(collection.currentPair.rightWebsiteId)
    if (
      !left ||
      !right ||
      left.id === right.id ||
      left.collectionId !== collection.id ||
      right.collectionId !== collection.id ||
      left.status !== 'ready' ||
      right.status !== 'ready'
    ) {
      throw damagedBackup()
    }
  }

  let aggregateByWebsite = new Map(
    websites.map((website) => [website.id, { comparisons: 0, wins: 0, losses: 0, skips: 0 }]),
  )
  for (let comparison of comparisons) {
    let left = websiteIds.get(comparison.leftWebsiteId)
    let right = websiteIds.get(comparison.rightWebsiteId)
    let expectedWinner =
      comparison.choice === 'left'
        ? comparison.leftWebsiteId
        : comparison.choice === 'right'
          ? comparison.rightWebsiteId
          : null
    if (
      !collectionIds.has(comparison.collectionId) ||
      !left ||
      !right ||
      left.id === right.id ||
      left.collectionId !== comparison.collectionId ||
      right.collectionId !== comparison.collectionId ||
      comparison.pairKey !== pairKey(left.id, right.id) ||
      comparison.winnerWebsiteId !== expectedWinner
    ) {
      throw damagedBackup()
    }

    let leftAggregate = aggregateByWebsite.get(left.id)!
    let rightAggregate = aggregateByWebsite.get(right.id)!
    leftAggregate.comparisons++
    rightAggregate.comparisons++
    if (comparison.choice === 'skip') {
      leftAggregate.skips++
      rightAggregate.skips++
    } else if (comparison.choice === 'left') {
      leftAggregate.wins++
      rightAggregate.losses++
    } else {
      rightAggregate.wins++
      leftAggregate.losses++
    }
  }

  for (let website of websites) {
    let aggregate = aggregateByWebsite.get(website.id)!
    if (
      website.comparisons !== aggregate.comparisons ||
      website.wins !== aggregate.wins ||
      website.losses !== aggregate.losses ||
      website.skips !== aggregate.skips
    ) {
      throw damagedBackup()
    }
  }
}

function uniqueRecordMap<RecordType extends { id: string }>(records: RecordType[]) {
  let recordMap = new Map<string, RecordType>()
  for (let record of records) {
    if (recordMap.has(record.id)) throw damagedBackup()
    recordMap.set(record.id, record)
  }
  return recordMap
}

function backupString(value: unknown, maxLength?: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    (maxLength !== undefined && value.length > maxLength) ||
    value.trim() !== value
  ) {
    throw damagedBackup()
  }
  return value
}

function backupNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw damagedBackup()
  return value
}

function backupInteger(value: unknown): number {
  let number = backupNumber(value)
  if (!Number.isSafeInteger(number) || number < 0) throw damagedBackup()
  return number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function damagedBackup(): Error {
  return new Error('This backup is damaged or incomplete.')
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
