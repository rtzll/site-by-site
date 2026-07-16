import * as fs from 'node:fs'
import * as path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import { createDatabase } from 'remix/data-table'
import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'
import { createSqliteDatabaseAdapter } from 'remix/data-table/sqlite'

const databaseDirectoryUrl = new URL('../../db/', import.meta.url)
const databaseFilePath =
  process.env.NODE_ENV === 'test'
    ? ':memory:'
    : fileURLToPath(new URL('site-by-site.sqlite', databaseDirectoryUrl))

if (databaseFilePath !== ':memory:') {
  fs.mkdirSync(fileURLToPath(databaseDirectoryUrl), { recursive: true })
}

export const sqlite = new DatabaseSync(databaseFilePath)
sqlite.exec('PRAGMA foreign_keys = ON')
sqlite.exec('PRAGMA journal_mode = WAL')

const adapter = createSqliteDatabaseAdapter(sqlite)
export const db = createDatabase(adapter)

let initializePromise: Promise<void> | null = null

export async function initializeDatabase(): Promise<void> {
  initializePromise ??= initialize()
  await initializePromise
}

export function closeDatabase(): void {
  if (sqlite.isOpen) sqlite.close()
}

async function initialize(): Promise<void> {
  let migrationsPath = path.resolve(fileURLToPath(databaseDirectoryUrl), 'migrations')
  let migrations = await loadMigrations(migrationsPath)
  await createMigrationRunner(adapter, migrations).up()
}
