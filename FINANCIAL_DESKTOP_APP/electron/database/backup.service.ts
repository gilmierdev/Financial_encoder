import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import { AppError } from '../services/ipc-handler'
import { logger } from '../services/logger.service'
import { closeDatabase, getDataDirectories, getDb, initDatabase } from './connection'

export interface BackupRecord {
  id: number
  filename: string
  path: string
  size_bytes: number
  created_at: string
}

export interface RestoreFileResult {
  restored: true
  filename: string
  /** Name of the safety snapshot taken before the restore, or null if it failed. */
  safetyBackup: string | null
}

export interface BackupExportResult {
  filePath: string
  bytes: number
}

const AUTO_BACKUP_WINDOW_MS = 24 * 60 * 60 * 1000
const AUTO_BACKUP_RETENTION_DAYS = 30

function stamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export function backupDateStamp(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Suggested portable backup filename, e.g. FinancialEncoder-Backup-2026-09-16.febak */
export function buildBackupFileName(date: Date = new Date()): string {
  return `FinancialEncoder-Backup-${backupDateStamp(date)}.febak`
}

const ACCEPTED_BACKUP_EXTS = new Set(['.febak', '.db', '.sqlite', '.sqlite3', '.db3'])

/**
 * Validates that a file is a readable SQLite database that looks like a
 * Financial Encoder backup. Nothing is modified. Used before any destructive
 * restore so corrupt or unrelated files are never written over the database.
 */
export function validateBackupFile(filePath: string): void {
  const ext = path.extname(filePath).toLowerCase()
  if (!ACCEPTED_BACKUP_EXTS.has(ext)) {
    throw new AppError('INVALID_BACKUP', 'Only .febak, .db or .sqlite backup files are supported.')
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new AppError('BACKUP_FILE_MISSING', 'The selected backup file does not exist.')
  }

  let probe: Database.Database | null = null
  try {
    probe = new Database(filePath, { readonly: true, fileMustExist: true })
    const tables = new Set(
      (probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
        (row) => row.name,
      ),
    )
    if (!tables.has('schema_migrations') || !tables.has('transactions') || !tables.has('categories')) {
      throw new AppError('INVALID_BACKUP', 'This file is not a Financial Encoder backup.')
    }
  } catch (err) {
    if (err instanceof AppError) {
      throw err
    }
    logger.warn('backup file validation failed', err instanceof Error ? err.message : String(err))
    throw new AppError('INVALID_BACKUP', 'This file is not a valid Financial Encoder backup.')
  } finally {
    if (probe) {
      try {
        probe.close()
      } catch {
        // best-effort cleanup
      }
    }
  }
}

export function listBackups(): BackupRecord[] {
  const db = getDb()
  return db.prepare(
    'SELECT id, filename, path, size_bytes, created_at FROM backups ORDER BY created_at DESC, id DESC',
  ).all() as BackupRecord[]
}

/**
 * Creates an automatic daily backup when none exists for the current 24-hour
 * window, then prunes automatic backups older than the retention window.
 * Manual backups are never created, modified or pruned by this flow.
 */
export async function createDailyBackupIfDue(): Promise<BackupRecord | null> {
  const db = getDb()
  const since = new Date(Date.now() - AUTO_BACKUP_WINDOW_MS).toISOString()
  const recent = db.prepare(
    "SELECT COUNT(*) AS n FROM backups WHERE filename LIKE 'auto-%' AND created_at >= ?",
  ).get(since) as { n: number }
  if (recent.n > 0) {
    return null
  }

  const dirs = getDataDirectories()
  fs.mkdirSync(dirs.backups, { recursive: true })
  const filename = `auto-${stamp()}.db`
  const dest = path.join(dirs.backups, filename)

  try {
    await db.backup(dest)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    logger.error('automatic backup creation failed', { detail })
    throw new AppError('BACKUP_FAILED', 'The automatic backup could not be created.', detail)
  }

  const size = fs.statSync(dest).size
  const result = db.prepare(
    'INSERT INTO backups (filename, path, size_bytes, created_at) VALUES (?, ?, ?, ?)',
  ).run(filename, dest, size, new Date().toISOString())

  const record = getBackup(Number(result.lastInsertRowid))
  pruneAutoBackups()

  logger.info('automatic backup created', { filename, size })
  return record as BackupRecord | null
}

function pruneAutoBackups(): void {
  const db = getDb()
  const cutoff = new Date(Date.now() - AUTO_BACKUP_RETENTION_DAYS * AUTO_BACKUP_WINDOW_MS).toISOString()
  const old = db.prepare(
    "SELECT id, path FROM backups WHERE filename LIKE 'auto-%' AND created_at < ?",
  ).all(cutoff) as { id: number; path: string }[]
  for (const item of old) {
    try {
      if (fs.existsSync(item.path)) {
        fs.unlinkSync(item.path)
      }
    } catch (err) {
      logger.warn('automatic backup pruning: could not delete file', err instanceof Error ? err.message : String(err))
    }
    db.prepare('DELETE FROM backups WHERE id = ?').run(item.id)
  }
  if (old.length > 0) {
    logger.info('pruned old automatic backups', { count: old.length })
  }
}

export async function createBackup(): Promise<BackupRecord> {
  const db = getDb()
  const dirs = getDataDirectories()
  fs.mkdirSync(dirs.backups, { recursive: true })

  const filename = `backup-${stamp()}.db`
  const dest = path.join(dirs.backups, filename)

  try {
    await db.backup(dest)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    logger.error('backup creation failed', { dest, detail })
    throw new AppError('BACKUP_FAILED', 'The backup could not be created.', detail)
  }

  const size = fs.statSync(dest).size
  const result = db.prepare(
    'INSERT INTO backups (filename, path, size_bytes, created_at) VALUES (?, ?, ?, ?)',
  ).run(filename, dest, size, new Date().toISOString())

  const record = getBackup(Number(result.lastInsertRowid))
  logger.info('backup created', { filename, size })
  return record as BackupRecord
}

function getBackup(id: number): BackupRecord | undefined {
  const db = getDb()
  return db.prepare('SELECT id, filename, path, size_bytes, created_at FROM backups WHERE id = ?').get(id) as BackupRecord | undefined
}

function assertBackupFile(record: BackupRecord): void {
  if (!fs.existsSync(record.path)) {
    throw new AppError('BACKUP_MISSING', 'The backup file no longer exists on disk.')
  }
}

export function deleteBackup(id: number): boolean {
  const db = getDb()
  const record = getBackup(id)
  if (!record) {
    return false
  }
  if (fs.existsSync(record.path)) {
    fs.unlinkSync(record.path)
  }
  db.prepare('DELETE FROM backups WHERE id = ?').run(id)
  logger.info('backup deleted', { id, filename: record.filename })
  return true
}

/**
 * Restores the database from any validated backup file. A safety copy of the
 * current database is taken first and the database is reopened afterwards, so
 * the app keeps working against the restored data.
 */
export async function restoreFromFile(sourceFile: string): Promise<RestoreFileResult> {
  validateBackupFile(sourceFile)

  const dirs = getDataDirectories()
  fs.mkdirSync(dirs.backups, { recursive: true })

  // Safety: keep a copy of the current database before it is replaced. This
  // must finish before the connection is closed below.
  let safetyBackup: string | null = null
  try {
    const d = getDb()
    const preRestore = path.join(dirs.backups, `pre-restore-${stamp()}.db`)
    await d.backup(preRestore)
    safetyBackup = path.basename(preRestore)
  } catch (err) {
    logger.warn('pre-restore safety backup failed', err instanceof Error ? err.message : String(err))
  }

  let committed = false
  try {
    closeDatabase()

    // Copy to a temp file then atomically replace so a failed copy never
    // leaves a half-written database behind.
    const temp = path.join(dirs.userData, 'restore-pending.db')
    fs.copyFileSync(sourceFile, temp)
    fs.renameSync(temp, dirs.databaseFile)

    initDatabase()
    committed = true
  } catch (err) {
    logger.error('restore failed', err instanceof Error ? { message: err.message, stack: err.stack } : String(err))
    // If the connection was closed but the replacement failed, bring the
    // existing database back so the app keeps working.
    try {
      initDatabase()
    } catch {
      // best-effort recovery
    }
    if (!committed) {
      throw new AppError('RESTORE_FAILED', 'The backup could not be restored. Your current data was not changed.')
    }
    throw err
  }

  logger.info('backup restored from file', { sourceFile, filename: path.basename(sourceFile), safetyBackup })
  return { restored: true as const, filename: path.basename(sourceFile), safetyBackup }
}

/**
 * Restores an internally recorded backup. Uses the same validated, safety-
 * backed restore path as restoring from an external file.
 */
export async function restoreBackup(id: number): Promise<RestoreFileResult> {
  const record = getBackup(id)
  if (!record) {
    throw new AppError('BACKUP_NOT_FOUND', 'That backup no longer exists.')
  }
  assertBackupFile(record)
  return restoreFromFile(record.path)
}

/**
 * Creates a backup snapshot and copies it to a user-chosen location (USB,
 * external drive, any folder). The internal snapshot stays in the backups
 * list so the user has a local copy too.
 */
export async function exportBackup(destPath: string): Promise<BackupExportResult> {
  const record = await createBackup()
  try {
    fs.copyFileSync(record.path, destPath)
  } catch (err) {
    logger.error('backup export copy failed', err instanceof Error ? err.message : String(err))
    throw new AppError('BACKUP_EXPORT_FAILED', 'The backup could not be saved to that location.')
  }
  logger.info('backup exported', { filePath: destPath, bytes: record.size_bytes })
  return { filePath: destPath, bytes: record.size_bytes }
}