import { AppError } from '../services/ipc-handler'
import { getDb } from '../database/connection'

const VALID_TYPES = ['income', 'expense', 'capital', 'withdrawal', 'asset', 'liability'] as const
export type CategoryType = (typeof VALID_TYPES)[number]

export interface Category {
  id: number
  name: string
  type: CategoryType
  is_default: number
}

export function listCategories(type?: CategoryType): Category[] {
  const db = getDb()
  const rows = type
    ? db.prepare('SELECT id, name, type, is_default FROM categories WHERE type = ? ORDER BY name COLLATE NOCASE').all(type)
    : db.prepare('SELECT id, name, type, is_default FROM categories ORDER BY type, name COLLATE NOCASE').all()
  return rows as Category[]
}

export function listCategoryTypes(): string[] {
  return [...VALID_TYPES]
}

export function createCategory(name: string, type: CategoryType): Category {
  const db = getDb()
  const trimmed = name.trim()
  if (trimmed === '' || trimmed.length > 60) {
    throw new AppError('VALIDATION_ERROR', 'Category name must be between 1 and 60 characters.')
  }
  if (!(VALID_TYPES as readonly string[]).includes(type)) {
    throw new AppError('VALIDATION_ERROR', 'A valid category type is required.')
  }

  const existing = db.prepare('SELECT id, name, type, is_default FROM categories WHERE name = ? COLLATE NOCASE AND type = ?')
    .get(trimmed, type) as Category | undefined
  if (existing) {
    return existing
  }

  const result = db.prepare('INSERT INTO categories (name, type, color, is_default) VALUES (?, ?, NULL, 0)').run(trimmed, type)
  const created = db.prepare('SELECT id, name, type, is_default FROM categories WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as Category
  return created
}