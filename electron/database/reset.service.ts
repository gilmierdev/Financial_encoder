import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../services/logger.service'
import { getDataDirectories, getDb, getDatabaseStatus, DatabaseStatus } from './connection'
import { seedIfEmpty } from './seed'

export interface ResetResult {
  status: DatabaseStatus
  /** Name of the safety snapshot kept before the wipe, or null if it failed. */
  safetyBackup: string | null
  deleted: {
    transactions: number
    categories: number
    backups: number
  }
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/**
 * Deletes every transaction, category, setting and backup so the app starts
 * again with a pristine database (default categories, default settings). A
 * safety snapshot is taken first and recorded as the single backup visible
 * afterwards, so the user can still recover the previous data if needed.
 */
export async function resetAllData(): Promise<ResetResult> {
  const db = getDb()
  const dirs = getDataDirectories()

  let safetyPath: string | null = null
  try {
    fs.mkdirSync(dirs.backups, { recursive: true })
    safetyPath = path.join(dirs.backups, `pre-reset-${stamp()}.db`)
    await db.backup(safetyPath)
  } catch (err) {
    logger.warn('pre-reset safety backup failed', err instanceof Error ? err.message : String(err))
    safetyPath = null
  }

  const deleted = db.transaction(() => {
    const txs = db.prepare('DELETE FROM transactions').run().changes
    const cats = db.prepare('DELETE FROM categories').run().changes
    const bks = db.prepare('DELETE FROM backups').run().changes
    db.prepare('DELETE FROM settings').run()
    db.prepare('DELETE FROM users').run()

    // Remove orphaned backup files except the fresh safety snapshot.
    if (fs.existsSync(dirs.backups)) {
      const keep = safetyPath ? path.resolve(safetyPath) : null
      for (const entry of fs.readdirSync(dirs.backups)) {
        const file = path.join(dirs.backups, entry)
        if (keep && path.resolve(file) === keep) {
          continue
        }
        try {
          fs.rmSync(file, { force: true })
        } catch {
          // best-effort cleanup
        }
      }
    }

    if (safetyPath) {
      db.prepare(
        'INSERT INTO backups (filename, path, size_bytes, created_at) VALUES (?, ?, ?, ?)',
      ).run(path.basename(safetyPath), safetyPath, fs.statSync(safetyPath).size, new Date().toISOString())
    }

    return { transactions: txs, categories: cats, backups: bks }
  })()

  seedIfEmpty(db)
  const status = getDatabaseStatus()
  logger.info('application data reset', { ...deleted, safetyBackup: safetyPath })

  return {
    status,
    safetyBackup: safetyPath ? path.basename(safetyPath) : null,
    deleted,
  }
}