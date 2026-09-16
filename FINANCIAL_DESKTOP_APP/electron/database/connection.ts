import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { AppError } from '../services/ipc-handler'
import { logger } from '../services/logger.service'
import { runMigrations } from './migrations'
import { seedIfEmpty } from './seed'

export interface DataDirectories {
  userData: string
  databaseFile: string
  backups: string
  documents: string
  exports: string
  logs: string
}

export interface DatabaseStatus {
  connected: boolean
  path: string
  sizeBytes: number
  schemaVersion: number
}

let db: Database.Database | null = null
let directories: DataDirectories | null = null

/** Directories used for all application data. Never inside the install folder. */
export function getDataDirectories(): DataDirectories {
  if (directories) {
    return directories
  }
  const userData = app.getPath('userData')
  directories = {
    userData,
    databaseFile: path.join(userData, 'database.db'),
    backups: path.join(userData, 'backups'),
    documents: path.join(userData, 'documents'),
    exports: path.join(userData, 'exports'),
    logs: path.join(userData, 'logs'),
  }
  return directories
}

/** Opens (or reuses) the local SQLite database and applies migrations. */
export function initDatabase(): Database.Database {
  if (db) {
    return db
  }
  const dirs = getDataDirectories()
  for (const dir of [dirs.backups, dirs.documents, dirs.exports, dirs.logs]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  try {
    const instance = new Database(dirs.databaseFile)
    instance.pragma('journal_mode = WAL')
    instance.pragma('foreign_keys = ON')
    instance.pragma('busy_timeout = 5000')
    instance.pragma('synchronous = NORMAL')
    // Disallow schema-embedded functions/expressions from dynamically loading
    // code (no-op on SQLite builds older than 3.37).
    instance.pragma('trusted_schema = OFF')
    // Overwrite deleted rows with zeros instead of leaving freed pages readable.
    instance.pragma('secure_delete = ON')
    db = instance

    runMigrations(instance)
    seedIfEmpty(instance)

    const integrity = instance.pragma('quick_check', { simple: true })
    if (integrity === 'ok') {
      logger.info('database integrity check passed')
    } else {
      logger.error('database integrity check failed', { result: String(integrity) })
    }

    logger.info('database initialized', { file: dirs.databaseFile })
    return instance
  } catch (err) {
    const detail = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err)
    logger.error('database initialization failed', detail)
    throw new AppError(
      'DATABASE_UNAVAILABLE',
      'The local database could not be opened. Check the application log for details.',
      detail,
    )
  }
}

export function getDb(): Database.Database {
  if (!db) {
    throw new AppError('DATABASE_CLOSED', 'The database is not open.')
  }
  return db
}

export function getDatabaseStatus(): DatabaseStatus {
  const dirs = getDataDirectories()
  try {
    const instance = db ?? initDatabase()
    const sizeBytes = fs.existsSync(dirs.databaseFile) ? fs.statSync(dirs.databaseFile).size : 0
    const schemaVersion = (
      instance.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }
    ).v ?? 0
    return { connected: true, path: dirs.databaseFile, sizeBytes, schemaVersion }
  } catch (err) {
    logger.error('database status check failed', err instanceof Error ? { message: err.message, stack: err.stack } : String(err))
    return { connected: false, path: dirs.databaseFile, sizeBytes: 0, schemaVersion: 0 }
  }
}

export function closeDatabase(): void {
  if (db) {
    try {
      db.close()
      logger.info('database closed')
    } catch (err) {
      logger.error('database close failed', err instanceof Error ? { message: err.message, stack: err.stack } : String(err))
    } finally {
      db = null
    }
  }
}