import type Database from 'better-sqlite3'
import { logger } from '../services/logger.service'

interface Migration {
  version: number
  name: string
  up(db: Database.Database): void
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'create core tables',
    up(db) {
      db.exec(`
        CREATE TABLE users (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          username      TEXT    NOT NULL UNIQUE,
          display_name  TEXT,
          created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE categories (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT NOT NULL,
          type        TEXT NOT NULL CHECK (type IN ('income','expense','capital','withdrawal','asset','liability')),
          color       TEXT,
          is_default  INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(name, type)
        );

        CREATE TABLE transactions (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          date        TEXT    NOT NULL,
          description TEXT    NOT NULL,
          category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
          type        TEXT    NOT NULL CHECK (type IN ('income','expense','capital','withdrawal','asset','liability')),
          amount      REAL    NOT NULL DEFAULT 0 CHECK (amount >= 0),
          notes       TEXT,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX idx_transactions_date   ON transactions(date);
        CREATE INDEX idx_transactions_type   ON transactions(type);
        CREATE INDEX idx_transactions_cat    ON transactions(category_id);
        CREATE INDEX idx_categories_type     ON categories(type);

        CREATE TABLE settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        ) WITHOUT ROWID;

        CREATE TABLE backups (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          filename   TEXT NOT NULL,
          path       TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
    },
  },
]

export function runMigrations(db: Database.Database): void {
  // The migration tracking table must exist before any migration is applied
  // or inspected.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version,
    ),
  )

  const ordered = migrations.slice().sort((a, b) => a.version - b.version)

  for (const migration of ordered) {
    if (applied.has(migration.version)) {
      continue
    }

    try {
      const run = db.transaction(() => {
        migration.up(db)
        db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
          migration.version,
          migration.name,
        )
      })
      run()
      logger.info(`migration ${migration.version} applied: ${migration.name}`)
    } catch (err) {
      const detail = err instanceof Error ? { message: err.message, stack: err.stack } : String(err)
      logger.error(`migration ${migration.version} failed`, detail)
      throw err
    }
  }
}