import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import { sqlite } from '../data/setup.ts'
import { updateElo } from './elo.ts'
import { pairKey, selectPair, type RankedWebsite } from './pair-selector.ts'

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

export type VoteChoice = 'left' | 'right' | 'skip'

export function fillBacklog(
  collectionId: string,
  targetSize = 10,
  database: DatabaseSync = sqlite,
  random: () => number = Math.random,
): number {
  let websites = database
    .prepare(
      `select id, rating, comparisons from websites
       where collection_id = ? and embed_status in ('allowed', 'conditional')`,
    )
    .all(collectionId) as unknown as RankedWebsite[]
  if (websites.length < 2) return 0

  let activeRows = database
    .prepare(
      `select website_a_id, website_b_id from prepared_pairs
       where collection_id = ? and status in ('prepared', 'current')`,
    )
    .all(collectionId) as Array<{ website_a_id: string; website_b_id: string }>
  let activeKeys = new Set(activeRows.map((row) => pairKey(row.website_a_id, row.website_b_id)))
  let recentRows = database
    .prepare(
      `select website_a_id, website_b_id from comparisons
       where collection_id = ? order by created_at desc limit 24`,
    )
    .all(collectionId) as Array<{ website_a_id: string; website_b_id: string }>
  let avoided = new Set([
    ...activeKeys,
    ...recentRows.map((row) => pairKey(row.website_a_id, row.website_b_id)),
  ])

  let queuePositionRow = database
    .prepare(`select coalesce(max(queue_position), 0) as position from prepared_pairs where collection_id = ?`)
    .get(collectionId) as { position: number }
  let position = Number(queuePositionRow.position)
  let created = 0

  while (activeRows.length + created < targetSize) {
    let pair = selectPair(websites, avoided, random)
    if (!pair) break
    let key = pairKey(pair.websiteAId, pair.websiteBId)
    if (activeKeys.has(key)) break

    position++
    database
      .prepare(
        `insert into prepared_pairs
          (id, collection_id, website_a_id, website_b_id, left_website_id, right_website_id,
           status, queue_position, created_at)
         values (?, ?, ?, ?, ?, ?, 'prepared', ?, ?)`,
      )
      .run(
        randomUUID(),
        collectionId,
        pair.websiteAId,
        pair.websiteBId,
        pair.leftWebsiteId,
        pair.rightWebsiteId,
        position,
        Date.now(),
      )
    activeKeys.add(key)
    avoided.add(key)
    created++
  }

  return created
}

export function getOrActivateCurrentPair(
  collectionId: string,
  database: DatabaseSync = sqlite,
): ComparisonPair | null {
  let current = getCurrentPairRow(collectionId, database)
  if (!current) {
    let next = database
      .prepare(
        `select id from prepared_pairs
         where collection_id = ? and status = 'prepared'
         order by queue_position asc limit 1`,
      )
      .get(collectionId) as { id: string } | undefined
    if (!next) return null

    database
      .prepare(`update prepared_pairs set status = 'current', shown_at = ? where id = ?`)
      .run(Date.now(), next.id)
    current = getCurrentPairRow(collectionId, database)
  }
  return current ? hydratePair(current, database) : null
}

export function getPreparedPairPreviews(
  collectionId: string,
  limit = 2,
  database: DatabaseSync = sqlite,
): ComparisonPair[] {
  let rows = database
    .prepare(
      `select * from prepared_pairs
       where collection_id = ? and status = 'prepared'
       order by queue_position asc limit ?`,
    )
    .all(collectionId, limit) as unknown as PairRow[]

  return rows
    .map((row) => hydratePair(row, database))
    .filter((pair): pair is ComparisonPair => pair !== null)
}

export function recordVote(
  collectionId: string,
  pairId: string,
  choice: VoteChoice,
  database: DatabaseSync = sqlite,
): ComparisonPair | null {
  database.exec('begin immediate')
  try {
    let pair = database
      .prepare(
        `select * from prepared_pairs
         where id = ? and collection_id = ? and status = 'current'`,
      )
      .get(pairId, collectionId) as PairRow | undefined
    if (!pair) throw new Error('This comparison is no longer current.')

    let left = readRating(pair.left_website_id, database)
    let right = readRating(pair.right_website_id, database)
    if (!left || !right) throw new Error('A website in this comparison no longer exists.')

    let winnerId: string | null = null
    if (choice === 'skip') {
      let update = database.prepare(
        `update websites set comparisons = comparisons + 1, skips = skips + 1 where id = ?`,
      )
      update.run(left.id)
      update.run(right.id)
    } else {
      let winner = choice === 'left' ? left : right
      let loser = choice === 'left' ? right : left
      let ratings = updateElo(winner.rating, loser.rating, winner.comparisons, loser.comparisons)
      database
        .prepare(
          `update websites set rating = ?, comparisons = comparisons + 1, wins = wins + 1 where id = ?`,
        )
        .run(ratings.winner, winner.id)
      database
        .prepare(
          `update websites set rating = ?, comparisons = comparisons + 1, losses = losses + 1 where id = ?`,
        )
        .run(ratings.loser, loser.id)
      winnerId = winner.id
    }

    let comparisonId = randomUUID()
    let now = Date.now()
    database
      .prepare(
        `insert into comparisons
          (id, collection_id, prepared_pair_id, website_a_id, website_b_id, left_website_id,
           right_website_id, outcome, winner_website_id, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        comparisonId,
        collectionId,
        pair.id,
        pair.website_a_id,
        pair.website_b_id,
        pair.left_website_id,
        pair.right_website_id,
        choice,
        winnerId,
        now,
      )
    database
      .prepare(
        `insert into votes (id, comparison_id, choice, winner_website_id, created_at)
         values (?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), comparisonId, choice, winnerId, now)
    database
      .prepare(`update prepared_pairs set status = 'completed', completed_at = ? where id = ?`)
      .run(now, pair.id)
    database.exec('commit')
  } catch (error) {
    database.exec('rollback')
    throw error
  }

  fillBacklog(collectionId, 10, database)
  return getOrActivateCurrentPair(collectionId, database)
}

export function markRuntimeFailed(
  collectionId: string,
  pairId: string,
  websiteId: string,
  database: DatabaseSync = sqlite,
): ComparisonPair | null {
  database.exec('begin immediate')
  try {
    database
      .prepare(
        `update websites set embed_status = 'runtime_failed',
          embed_reason = 'The iframe did not become ready in the browser.', last_checked_at = ?
         where id = ? and collection_id = ?`,
      )
      .run(Date.now(), websiteId, collectionId)
    database
      .prepare(
        `update prepared_pairs set status = 'discarded', completed_at = ?
         where id = ? and collection_id = ? and status = 'current'`,
      )
      .run(Date.now(), pairId, collectionId)
    database
      .prepare(
        `update prepared_pairs set status = 'discarded', completed_at = ?
         where collection_id = ? and status = 'prepared'
           and (website_a_id = ? or website_b_id = ?)`,
      )
      .run(Date.now(), collectionId, websiteId, websiteId)
    database.exec('commit')
  } catch (error) {
    database.exec('rollback')
    throw error
  }

  fillBacklog(collectionId, 10, database)
  return getOrActivateCurrentPair(collectionId, database)
}

function getCurrentPairRow(collectionId: string, database: DatabaseSync): PairRow | null {
  return (
    (database
      .prepare(
        `select * from prepared_pairs
         where collection_id = ? and status = 'current' order by shown_at asc limit 1`,
      )
      .get(collectionId) as PairRow | undefined) ?? null
  )
}

function hydratePair(pair: PairRow, database: DatabaseSync): ComparisonPair | null {
  let left = readComparisonWebsite(pair.left_website_id, database)
  let right = readComparisonWebsite(pair.right_website_id, database)
  return left && right ? { id: pair.id, left, right } : null
}

function readComparisonWebsite(
  websiteId: string,
  database: DatabaseSync,
): ComparisonWebsite | null {
  let row = database
    .prepare(`select id, final_url, normalized_url, domain, title from websites where id = ?`)
    .get(websiteId) as
    | { id: string; final_url: string | null; normalized_url: string; domain: string; title: string | null }
    | undefined
  return row
    ? { id: row.id, url: row.final_url ?? row.normalized_url, domain: row.domain, title: row.title }
    : null
}

function readRating(
  websiteId: string,
  database: DatabaseSync,
): { id: string; rating: number; comparisons: number } | null {
  return (
    (database
      .prepare(`select id, rating, comparisons from websites where id = ?`)
      .get(websiteId) as { id: string; rating: number; comparisons: number } | undefined) ?? null
  )
}

interface PairRow {
  id: string
  website_a_id: string
  website_b_id: string
  left_website_id: string
  right_website_id: string
}
