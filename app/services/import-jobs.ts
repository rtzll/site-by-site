import type { DatabaseSync } from 'node:sqlite'

import { sqlite } from '../data/setup.ts'
import { syncImportProgress, type ImportProgress } from '../data/store.ts'
import { checkEmbeddability, type EmbedCheckResult } from './embed-check.ts'

interface ClaimedCheck {
  id: string
  websiteId: string
  url: string
}

export async function processPendingChecks(
  collectionId: string,
  options: {
    limit?: number
    database?: DatabaseSync
    check?: (url: string) => Promise<EmbedCheckResult>
  } = {},
): Promise<ImportProgress | null> {
  let database = options.database ?? sqlite
  let checks = claimChecks(collectionId, options.limit ?? 3, database)
  let check = options.check ?? checkEmbeddability

  await Promise.all(
    checks.map(async (claimed) => {
      let result = await check(claimed.url)
      let now = Date.now()

      database.exec('begin immediate')
      try {
        database
          .prepare(
            `update websites set
              final_url = ?, title = coalesce(?, title), embed_status = ?, embed_reason = ?,
              http_status = ?, last_checked_at = ?
             where id = ?`,
          )
          .run(
            result.finalUrl,
            result.title,
            result.status,
            result.reason,
            result.httpStatus,
            now,
            claimed.websiteId,
          )
        database
          .prepare(`update url_check_jobs set status = 'complete', error = null, updated_at = ? where id = ?`)
          .run(now, claimed.id)
        database.exec('commit')
      } catch (error) {
        database.exec('rollback')
        markCheckFailed(claimed.id, error, database)
      }
    }),
  )

  return syncImportProgress(collectionId, database)
}

function claimChecks(
  collectionId: string,
  limit: number,
  database: DatabaseSync,
): ClaimedCheck[] {
  database.exec('begin immediate')
  try {
    let rows = database
      .prepare(
        `select j.id, j.website_id, w.normalized_url
         from url_check_jobs j
         join websites w on w.id = j.website_id
         where j.collection_id = ? and j.status = 'pending'
         order by j.created_at asc
         limit ?`,
      )
      .all(collectionId, limit) as Array<{
      id: string
      website_id: string
      normalized_url: string
    }>

    let now = Date.now()
    let update = database.prepare(
      `update url_check_jobs set status = 'running', attempts = attempts + 1, updated_at = ? where id = ?`,
    )
    for (let row of rows) update.run(now, row.id)
    database.exec('commit')

    return rows.map((row) => ({ id: row.id, websiteId: row.website_id, url: row.normalized_url }))
  } catch (error) {
    database.exec('rollback')
    throw error
  }
}

function markCheckFailed(checkId: string, error: unknown, database: DatabaseSync) {
  let message = error instanceof Error ? error.message : 'URL check failed.'
  database
    .prepare(`update url_check_jobs set status = 'failed', error = ?, updated_at = ? where id = ?`)
    .run(message, Date.now(), checkId)
}
