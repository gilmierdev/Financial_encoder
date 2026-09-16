import * as path from 'path'
import { getDb } from './connection'
import type { AppSettings } from '../types/ipc'

export const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Financial Encoder',
  currency: 'PHP',
  dateFormat: 'YYYY-MM-DD',
  theme: 'system',
  defaultExportFolder: '',
}

export type { AppSettings }

export const SETTING_KEYS: Record<keyof AppSettings, keyof AppSettings> = {
  appName: 'appName',
  currency: 'currency',
  dateFormat: 'dateFormat',
  theme: 'theme',
  defaultExportFolder: 'defaultExportFolder',
}

const VALID_THEMES = new Set(['light', 'dark', 'system'])
// Display tokens only (YYYY / MMMM / MMM / MM / DD / D) plus common separators.
const VALID_DATE_FORMAT_PATTERN = /^[YMD\-\/.\s]+$/
const CONTROL_CHARS = /[\u0000-\u001f]/

export function isAppSettingKey(value: unknown): value is keyof AppSettings {
  return typeof value === 'string' && value in SETTING_KEYS
}

/** Returns all settings merged over their defaults. */
export function getAllSettings(): AppSettings {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const persisted: Record<string, string> = {}
  for (const row of rows) {
    persisted[row.key] = row.value
  }
  return { ...DEFAULT_SETTINGS, ...persisted } as AppSettings
}

/**
 * Persists a setting. Values are validated here in the main process so the
 * renderer can never write arbitrary or malformed settings.
 */
export function setSetting(key: keyof AppSettings, value: string): AppSettings {
  if (!isAppSettingKey(key)) {
    throw new Error(`Unknown setting key: ${key}`)
  }
  if (typeof value !== 'string' || value.length > 200) {
    throw new Error(`Invalid value for setting: ${key}`)
  }
  if (key === 'theme' && !VALID_THEMES.has(value)) {
    throw new Error(`Invalid theme value: ${value}`)
  }
  if (key === 'currency' && !/^[A-Za-z]{3}$/.test(value)) {
    throw new Error(`Invalid currency code: ${value}`)
  }
  if (key === 'dateFormat' && !VALID_DATE_FORMAT_PATTERN.test(value)) {
    throw new Error('Invalid date format.')
  }
  if (key === 'defaultExportFolder') {
    if (value !== '' && (!path.isAbsolute(value) || CONTROL_CHARS.test(value))) {
      throw new Error('Invalid export folder.')
    }
  }

  const db = getDb()
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, value)

  return getAllSettings()
}