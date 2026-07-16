import { column as c, table } from 'remix/data-table'

export const collections = table({
  name: 'collections',
  columns: {
    id: c.text().primaryKey().notNull(),
    name: c.text().notNull(),
    source_type: c.enum(['bookmarks', 'paste']).notNull(),
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})

export const websites = table({
  name: 'websites',
  columns: {
    id: c.text().primaryKey().notNull(),
    collection_id: c.text().notNull().references('collections', 'id').onDelete('cascade'),
    input_url: c.text().notNull(),
    normalized_url: c.text().notNull(),
    final_url: c.text(),
    domain: c.text().notNull(),
    title: c.text(),
    embed_status: c
      .enum(['allowed', 'blocked', 'conditional', 'unverified', 'runtime_failed'])
      .notNull()
      .default('unverified'),
    embed_reason: c.text(),
    http_status: c.integer(),
    rating: c.integer().notNull().default(1500),
    comparisons: c.integer().notNull().default(0),
    wins: c.integer().notNull().default(0),
    losses: c.integer().notNull().default(0),
    skips: c.integer().notNull().default(0),
    last_checked_at: c.integer(),
    snapshot_url: c.text(),
    snapshot_status: c.text(),
    created_at: c.integer().notNull(),
  },
})

export const importJobs = table({
  name: 'import_jobs',
  columns: {
    id: c.text().primaryKey().notNull(),
    collection_id: c.text().references('collections', 'id').onDelete('cascade'),
    source_type: c.enum(['bookmarks', 'paste']).notNull(),
    status: c.enum(['selecting', 'checking', 'complete', 'failed']).notNull(),
    payload_json: c.text(),
    found_count: c.integer().notNull().default(0),
    ready_count: c.integer().notNull().default(0),
    checking_count: c.integer().notNull().default(0),
    unavailable_count: c.integer().notNull().default(0),
    error: c.text(),
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})

export const urlCheckJobs = table({
  name: 'url_check_jobs',
  columns: {
    id: c.text().primaryKey().notNull(),
    collection_id: c.text().notNull().references('collections', 'id').onDelete('cascade'),
    website_id: c.text().notNull().references('websites', 'id').onDelete('cascade'),
    status: c.enum(['pending', 'running', 'complete', 'failed']).notNull(),
    attempts: c.integer().notNull().default(0),
    error: c.text(),
    created_at: c.integer().notNull(),
    updated_at: c.integer().notNull(),
  },
})

export const preparedPairs = table({
  name: 'prepared_pairs',
  columns: {
    id: c.text().primaryKey().notNull(),
    collection_id: c.text().notNull().references('collections', 'id').onDelete('cascade'),
    website_a_id: c.text().notNull().references('websites', 'id').onDelete('cascade'),
    website_b_id: c.text().notNull().references('websites', 'id').onDelete('cascade'),
    left_website_id: c.text().notNull().references('websites', 'id').onDelete('cascade'),
    right_website_id: c.text().notNull().references('websites', 'id').onDelete('cascade'),
    status: c.enum(['prepared', 'current', 'completed', 'discarded']).notNull(),
    queue_position: c.integer().notNull(),
    created_at: c.integer().notNull(),
    shown_at: c.integer(),
    completed_at: c.integer(),
  },
})

export const comparisons = table({
  name: 'comparisons',
  columns: {
    id: c.text().primaryKey().notNull(),
    collection_id: c.text().notNull().references('collections', 'id').onDelete('cascade'),
    prepared_pair_id: c.text().notNull().references('prepared_pairs', 'id').onDelete('cascade'),
    website_a_id: c.text().notNull().references('websites', 'id').onDelete('cascade'),
    website_b_id: c.text().notNull().references('websites', 'id').onDelete('cascade'),
    left_website_id: c.text().notNull().references('websites', 'id').onDelete('cascade'),
    right_website_id: c.text().notNull().references('websites', 'id').onDelete('cascade'),
    outcome: c.enum(['left', 'right', 'skip']).notNull(),
    winner_website_id: c.text().references('websites', 'id').onDelete('set null'),
    created_at: c.integer().notNull(),
  },
})

export const votes = table({
  name: 'votes',
  columns: {
    id: c.text().primaryKey().notNull(),
    comparison_id: c.text().notNull().references('comparisons', 'id').onDelete('cascade'),
    choice: c.enum(['left', 'right', 'skip']).notNull(),
    winner_website_id: c.text().references('websites', 'id').onDelete('set null'),
    created_at: c.integer().notNull(),
  },
})
