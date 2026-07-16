import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import type { BookmarkFolder } from '../utils/bookmarks.ts'
import type { ImportedUrl } from '../utils/urls.ts'
import { sqlite } from './setup.ts'

export type SourceType = 'bookmarks' | 'paste'
export type ImportJobStatus = 'selecting' | 'checking' | 'complete' | 'failed'

export interface CollectionSummary {
  id: string
  name: string
  sourceType: SourceType
  websiteCount: number
  availableCount: number
  unavailableCount: number
  comparisonCount: number
}

export interface WebsiteRecord {
  id: string
  collectionId: string
  inputUrl: string
  normalizedUrl: string
  finalUrl: string | null
  domain: string
  title: string | null
  embedStatus: string
  embedReason: string | null
  httpStatus: number | null
  rating: number
  comparisons: number
  wins: number
  losses: number
  skips: number
}

export interface ImportProgress {
  id: string
  collectionId: string | null
  status: ImportJobStatus
  found: number
  ready: number
  checking: number
  unavailable: number
}

export function createBookmarkSelectionJob(
  folders: BookmarkFolder[],
  database: DatabaseSync = sqlite,
): string {
  let id = randomUUID()
  let now = Date.now()
  database
    .prepare(
      `insert into import_jobs
        (id, source_type, status, payload_json, found_count, created_at, updated_at)
       values (?, 'bookmarks', 'selecting', ?, ?, ?, ?)`,
    )
    .run(id, JSON.stringify(folders), folders.reduce((total, folder) => total + folder.urls.length, 0), now, now)
  return id
}

export function getBookmarkSelectionJob(
  jobId: string,
  database: DatabaseSync = sqlite,
): { id: string; folders: BookmarkFolder[] } | null {
  let row = database
    .prepare(`select id, payload_json from import_jobs where id = ? and status = 'selecting'`)
    .get(jobId) as { id: string; payload_json: string | null } | undefined

  if (!row?.payload_json) return null
  try {
    return { id: row.id, folders: JSON.parse(row.payload_json) as BookmarkFolder[] }
  } catch {
    return null
  }
}

export function createCollectionWithImport(
  name: string,
  sourceType: SourceType,
  importedUrls: ImportedUrl[],
  options: { jobId?: string; database?: DatabaseSync } = {},
): { collectionId: string; jobId: string; added: number } {
  let database = options.database ?? sqlite
  let collectionId = randomUUID()
  let jobId = options.jobId ?? randomUUID()
  let now = Date.now()

  database.exec('begin immediate')
  try {
    database
      .prepare(
        `insert into collections (id, name, source_type, created_at, updated_at)
         values (?, ?, ?, ?, ?)`,
      )
      .run(collectionId, name.trim(), sourceType, now, now)

    if (options.jobId) {
      database
        .prepare(
          `update import_jobs
           set collection_id = ?, status = 'checking', payload_json = null,
               found_count = ?, checking_count = ?, updated_at = ?
           where id = ?`,
        )
        .run(collectionId, importedUrls.length, importedUrls.length, now, jobId)
    } else {
      database
        .prepare(
          `insert into import_jobs
            (id, collection_id, source_type, status, found_count, checking_count, created_at, updated_at)
           values (?, ?, ?, 'checking', ?, ?, ?, ?)`,
        )
        .run(jobId, collectionId, sourceType, importedUrls.length, importedUrls.length, now, now)
    }

    let added = insertWebsites(database, collectionId, importedUrls, now)
    database.exec('commit')
    return { collectionId, jobId, added }
  } catch (error) {
    database.exec('rollback')
    throw error
  }
}

export function addWebsites(
  collectionId: string,
  importedUrls: ImportedUrl[],
  database: DatabaseSync = sqlite,
): { jobId: string; added: number } {
  let jobId = randomUUID()
  let now = Date.now()

  database.exec('begin immediate')
  try {
    let added = insertWebsites(database, collectionId, importedUrls, now)
    database
      .prepare(
        `insert into import_jobs
          (id, collection_id, source_type, status, found_count, checking_count, created_at, updated_at)
         values (?, ?, 'paste', ?, ?, ?, ?, ?)`,
      )
      .run(jobId, collectionId, added === 0 ? 'complete' : 'checking', added, added, now, now)
    database.prepare(`update collections set updated_at = ? where id = ?`).run(now, collectionId)
    database.exec('commit')
    return { jobId, added }
  } catch (error) {
    database.exec('rollback')
    throw error
  }
}

export function getCollectionSummary(
  collectionId: string,
  database: DatabaseSync = sqlite,
): CollectionSummary | null {
  let row = database
    .prepare(
      `select
        c.id,
        c.name,
        c.source_type,
        count(distinct w.id) as website_count,
        count(distinct case when w.embed_status in ('allowed', 'conditional') then w.id end) as available_count,
        count(distinct case when w.embed_status not in ('allowed', 'conditional') then w.id end) as unavailable_count,
        (select count(*) from comparisons x where x.collection_id = c.id) as comparison_count
       from collections c
       left join websites w on w.collection_id = c.id
       where c.id = ?
       group by c.id`,
    )
    .get(collectionId) as
    | {
        id: string
        name: string
        source_type: SourceType
        website_count: number
        available_count: number
        unavailable_count: number
        comparison_count: number
      }
    | undefined

  return row
    ? {
        id: row.id,
        name: row.name,
        sourceType: row.source_type,
        websiteCount: Number(row.website_count),
        availableCount: Number(row.available_count),
        unavailableCount: Number(row.unavailable_count),
        comparisonCount: Number(row.comparison_count),
      }
    : null
}

export function getLatestImportProgress(
  collectionId: string,
  database: DatabaseSync = sqlite,
): ImportProgress | null {
  let row = database
    .prepare(
      `select id, collection_id, status, found_count, ready_count, checking_count, unavailable_count
       from import_jobs where collection_id = ? order by created_at desc limit 1`,
    )
    .get(collectionId) as
    | {
        id: string
        collection_id: string | null
        status: ImportJobStatus
        found_count: number
        ready_count: number
        checking_count: number
        unavailable_count: number
      }
    | undefined

  return row ? mapProgress(row) : null
}

export function syncImportProgress(
  collectionId: string,
  database: DatabaseSync = sqlite,
): ImportProgress | null {
  let job = database
    .prepare(`select id from import_jobs where collection_id = ? order by created_at desc limit 1`)
    .get(collectionId) as { id: string } | undefined
  if (!job) return null

  let counts = database
    .prepare(
      `select
        count(*) as found,
        sum(case when embed_status in ('allowed', 'conditional') then 1 else 0 end) as ready,
        sum(case when embed_status in ('blocked', 'unverified', 'runtime_failed')
          and id not in (select website_id from url_check_jobs where status in ('pending', 'running'))
          then 1 else 0 end) as unavailable,
        (select count(*) from url_check_jobs where collection_id = ? and status in ('pending', 'running')) as checking
       from websites where collection_id = ?`,
    )
    .get(collectionId, collectionId) as {
    found: number
    ready: number | null
    unavailable: number | null
    checking: number
  }

  let status: ImportJobStatus = Number(counts.checking) === 0 ? 'complete' : 'checking'
  database
    .prepare(
      `update import_jobs
       set status = ?, found_count = ?, ready_count = ?, checking_count = ?, unavailable_count = ?, updated_at = ?
       where id = ?`,
    )
    .run(
      status,
      Number(counts.found),
      Number(counts.ready ?? 0),
      Number(counts.checking),
      Number(counts.unavailable ?? 0),
      Date.now(),
      job.id,
    )

  return getLatestImportProgress(collectionId, database)
}

export function getRankedWebsites(
  collectionId: string,
  database: DatabaseSync = sqlite,
): WebsiteRecord[] {
  let rows = database
    .prepare(
      `select * from websites where collection_id = ?
       order by
         case when embed_status in ('allowed', 'conditional') then 0 else 1 end,
         rating desc, wins desc, comparisons desc, domain asc`,
    )
    .all(collectionId) as unknown as WebsiteRow[]
  return rows.map(mapWebsite)
}

export function getWebsite(
  websiteId: string,
  database: DatabaseSync = sqlite,
): WebsiteRecord | null {
  let row = database.prepare(`select * from websites where id = ?`).get(websiteId) as
    | WebsiteRow
    | undefined
  return row ? mapWebsite(row) : null
}

function insertWebsites(
  database: DatabaseSync,
  collectionId: string,
  importedUrls: ImportedUrl[],
  now: number,
): number {
  let websiteStatement = database.prepare(
    `insert or ignore into websites
      (id, collection_id, input_url, normalized_url, domain, embed_status, created_at)
     values (?, ?, ?, ?, ?, 'unverified', ?)`,
  )
  let checkStatement = database.prepare(
    `insert into url_check_jobs
      (id, collection_id, website_id, status, attempts, created_at, updated_at)
     values (?, ?, ?, 'pending', 0, ?, ?)`,
  )
  let added = 0

  for (let importedUrl of importedUrls) {
    let websiteId = randomUUID()
    let result = websiteStatement.run(
      websiteId,
      collectionId,
      importedUrl.inputUrl,
      importedUrl.normalizedUrl,
      importedUrl.domain,
      now,
    )
    if (result.changes === 0) continue
    checkStatement.run(randomUUID(), collectionId, websiteId, now, now)
    added++
  }

  return added
}

function mapProgress(row: {
  id: string
  collection_id: string | null
  status: ImportJobStatus
  found_count: number
  ready_count: number
  checking_count: number
  unavailable_count: number
}): ImportProgress {
  return {
    id: row.id,
    collectionId: row.collection_id,
    status: row.status,
    found: Number(row.found_count),
    ready: Number(row.ready_count),
    checking: Number(row.checking_count),
    unavailable: Number(row.unavailable_count),
  }
}

interface WebsiteRow {
  id: string
  collection_id: string
  input_url: string
  normalized_url: string
  final_url: string | null
  domain: string
  title: string | null
  embed_status: string
  embed_reason: string | null
  http_status: number | null
  rating: number
  comparisons: number
  wins: number
  losses: number
  skips: number
}

function mapWebsite(row: WebsiteRow): WebsiteRecord {
  return {
    id: row.id,
    collectionId: row.collection_id,
    inputUrl: row.input_url,
    normalizedUrl: row.normalized_url,
    finalUrl: row.final_url,
    domain: row.domain,
    title: row.title,
    embedStatus: row.embed_status,
    embedReason: row.embed_reason,
    httpStatus: row.http_status,
    rating: Number(row.rating),
    comparisons: Number(row.comparisons),
    wins: Number(row.wins),
    losses: Number(row.losses),
    skips: Number(row.skips),
  }
}
