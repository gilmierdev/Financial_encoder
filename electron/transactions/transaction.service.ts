import { AppError } from '../services/ipc-handler'
import { logger } from '../services/logger.service'
import { getDb } from '../database/connection'
import { isValidAmount, isValidDateString, MAX_SEARCH_TERM_LENGTH } from '../services/validation'

const VALID_TYPES = ['income', 'expense', 'capital', 'withdrawal', 'asset', 'liability'] as const
export type TransactionType = (typeof VALID_TYPES)[number]

function isKnownType(value: string): value is TransactionType {
  return (VALID_TYPES as readonly string[]).includes(value)
}

function validateInput(
  tx: TransactionInput,
): void {
  if (!isValidDateString(tx.date)) {
    throw new AppError('VALIDATION_ERROR', 'A valid calendar date (YYYY-MM-DD) is required.')
  }
  if (typeof tx.description !== 'string' || tx.description.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', 'A description is required.')
  }
  if (tx.description.length > 255) {
    throw new AppError('VALIDATION_ERROR', 'Description must be 255 characters or fewer.')
  }
  if (!Number.isInteger(tx.category_id) || tx.category_id <= 0) {
    throw new AppError('VALIDATION_ERROR', 'A category must be selected.')
  }
  if (typeof tx.type !== 'string' || !isKnownType(tx.type)) {
    throw new AppError('VALIDATION_ERROR', 'A valid transaction type is required.')
  }
  if (!isValidAmount(tx.amount)) {
    throw new AppError('VALIDATION_ERROR', 'Amount must be a non-negative number and cannot exceed a trillion.')
  }
  if (
    tx.notes !== null &&
    tx.notes !== undefined &&
    (typeof tx.notes !== 'string' || tx.notes.length > 2000)
  ) {
    throw new AppError('VALIDATION_ERROR', 'Notes must be 2000 characters or fewer.')
  }
}

function assertCategoryExists(category_id: number): void {
  const db = getDb()
  const row = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id)
  if (!row) {
    throw new AppError('VALIDATION_ERROR', 'The selected category does not exist.')
  }
}

export interface Transaction {
  id: number
  date: string
  description: string
  category_id: number
  type: TransactionType
  category_name: string
  category_type: TransactionType
  amount: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type TransactionInput = Omit<
  Transaction,
  'id' | 'created_at' | 'updated_at' | 'category_name' | 'category_type'
>

export interface TransactionFilters {
  type?: TransactionType[]
  category_id?: number[]
  date_from?: string
  date_to?: string
  search_term?: string
  sort_by?: 'date' | 'description' | 'amount' | 'type'
  sort_dir?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export interface TransactionPage {
  transactions: Transaction[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

const COLUMN_MAP: Record<Required<TransactionFilters>['sort_by'], string> = {
  date: 't.date',
  description: 't.description',
  amount: 't.amount',
  type: 't.type',
}

function orderByClause(filters: TransactionFilters): string {
  const raw = filters.sort_by ?? 'date'
  const by = raw in COLUMN_MAP ? raw : 'date'
  const dir = filters.sort_dir === 'asc' ? 'ASC' : 'DESC'
  return `${COLUMN_MAP[by]} ${dir}, t.id DESC`
}

const BASE_SELECT = `
  SELECT t.id, t.date, t.description, t.category_id, t.type, t.amount, t.notes,
         t.created_at, t.updated_at,
         c.name AS category_name, c.type AS category_type
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
`

export function listTransactions(filters: TransactionFilters = {}): TransactionPage {
  const db = getDb()

  const page = Number.isInteger(filters.page) && (filters.page ?? 0) > 0 ? filters.page! : 1
  const page_size = Number.isInteger(filters.page_size) && (filters.page_size ?? 0) > 0
    ? Math.min(filters.page_size!, 200)
    : 20
  const offset = (page - 1) * page_size

  if (typeof filters.date_from === 'string' && !isValidDateString(filters.date_from)) {
    throw new AppError('VALIDATION_ERROR', 'date_from must be a valid calendar date (YYYY-MM-DD).')
  }
  if (typeof filters.date_to === 'string' && !isValidDateString(filters.date_to)) {
    throw new AppError('VALIDATION_ERROR', 'date_to must be a valid calendar date (YYYY-MM-DD).')
  }
  if (
    typeof filters.search_term === 'string' &&
    filters.search_term.length > MAX_SEARCH_TERM_LENGTH
  ) {
    throw new AppError('VALIDATION_ERROR', 'Search term is too long.')
  }

  const where: string[] = []
  const params: (string | number)[] = []

  if (filters.search_term && filters.search_term.trim().length > 0) {
    const term = `%${filters.search_term.trim()}%`
    where.push('(t.description LIKE ? OR c.name LIKE ?)')
    params.push(term, term)
  }
  if (filters.type?.length) {
    const filtered = filters.type.filter((t): t is TransactionType => isKnownType(t))
    if (filtered.length > 0) {
      where.push(`t.type IN (${filtered.map(() => '?').join(', ')})`)
      params.push(...filtered)
    }
  }
  if (filters.category_id?.length) {
    const ids = filters.category_id.filter(Number.isInteger)
    if (ids.length > 0) {
      where.push(`t.category_id IN (${ids.map(() => '?').join(', ')})`)
      params.push(...ids)
    }
  }
  if (filters.date_from) {
    where.push('t.date >= ?')
    params.push(filters.date_from)
  }
  if (filters.date_to) {
    where.push('t.date <= ?')
    params.push(filters.date_to)
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  const countRow = db.prepare(`SELECT COUNT(*) AS total FROM transactions t JOIN categories c ON t.category_id = c.id ${whereClause}`)
    .get(...params) as { total: number }
  const total = countRow.total

  const rows = db.prepare(`
    ${BASE_SELECT}
    ${whereClause}
    ORDER BY ${orderByClause(filters)}
    LIMIT ? OFFSET ?
  `).all(...params, page_size, offset) as Transaction[]

  return {
    transactions: rows,
    total,
    page,
    page_size,
    total_pages: total > 0 ? Math.ceil(total / page_size) : 0,
  }
}

export function listAllTransactions(filters: TransactionFilters = {}): Transaction[] {
  const pageSize = 200
  const transactions: Transaction[] = []
  const first = listTransactions({ ...filters, page: 1, page_size: pageSize })
  transactions.push(...first.transactions)
  for (let page = 2; page <= first.total_pages; page += 1) {
    transactions.push(...listTransactions({ ...filters, page, page_size: pageSize }).transactions)
  }
  return transactions
}

export function getTransaction(id: number): Transaction | null {
  const db = getDb()
  const row = db.prepare(`${BASE_SELECT} WHERE t.id = ?`).get(id) as Transaction | undefined
  return row ?? null
}

export function createTransaction(
  tx: TransactionInput,
): Transaction {
  validateInput(tx)
  assertCategoryExists(tx.category_id)

  const db = getDb()
  const now = new Date().toISOString()

  const result = db.prepare(
    `INSERT INTO transactions (date, description, category_id, type, amount, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    tx.date,
    tx.description.trim(),
    tx.category_id,
    tx.type,
    tx.amount,
    tx.notes ?? null,
    now,
    now,
  )

  const created = getTransaction(Number(result.lastInsertRowid))
  if (!created) {
    logger.error('createTransaction: created row could not be read back')
    throw new AppError('DATABASE_ERROR', 'The transaction was not created.')
  }
  return created
}

export function updateTransaction(
  id: number,
  tx: Partial<TransactionInput>,
): Transaction | null {
  const db = getDb()
  const existing = getTransaction(id)
  if (!existing) {
    return null
  }

  validateInput({ ...existing, ...tx })
  if (tx.category_id !== undefined && tx.category_id !== existing.category_id) {
    assertCategoryExists(tx.category_id)
  }

  const fields: string[] = []
  const values: (string | number | null)[] = []

  if (tx.date !== undefined) { fields.push('date = ?'); values.push(tx.date) }
  if (tx.description !== undefined) { fields.push('description = ?'); values.push(tx.description.trim()) }
  if (tx.category_id !== undefined) { fields.push('category_id = ?'); values.push(tx.category_id) }
  if (tx.type !== undefined) { fields.push('type = ?'); values.push(tx.type) }
  if (tx.amount !== undefined) { fields.push('amount = ?'); values.push(tx.amount) }
  if (tx.notes !== undefined) { fields.push('notes = ?'); values.push(tx.notes ?? null) }

  fields.push('updated_at = ?')
  values.push(new Date().toISOString(), id)

  db.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getTransaction(id)
}

export function deleteTransaction(id: number): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
  return result.changes > 0
}