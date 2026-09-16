import { readFile, stat } from 'fs/promises'
import * as path from 'path'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { AppError } from '../services/ipc-handler'
import { logger } from '../services/logger.service'
import { getDb } from '../database/connection'
import { MAX_AMOUNT, MAX_IMPORT_FILE_BYTES } from '../services/validation'

export const IMPORT_FIELDS = ['date', 'description', 'amount', 'type', 'category', 'notes'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

export interface ImportPreview {
  fileName: string
  filePath: string
  totalRows: number
  columns: string[]
  sampleRows: string[][]
  suggested: Record<ImportField, number>
}

export interface ImportMapping {
  filePath: string
  mapping: Record<ImportField, number>
}

export interface ImportResult {
  imported: number
  skipped: number
  warnings: string[]
}

const PREVIEW_ROWS = 10
const MAX_IMPORT_ROWS = 50000
const MAX_WARNINGS = 20
const MAX_MAPPING_INDEX = 1000
const MAX_PICKED_PATHS = 50

const VALID_TYPES = ['income', 'expense', 'capital', 'withdrawal', 'asset', 'liability'] as const

// Allowlist of file paths negotiated through import:pick in this session.
// confirmImport only accepts files on this list so the renderer can never make
// the main process read arbitrary files off disk.
const pickedImportPaths = new Set<string>()

function recordPickedImportPath(filePath: string): void {
  if (pickedImportPaths.has(filePath)) {
    return
  }
  if (pickedImportPaths.size >= MAX_PICKED_PATHS) {
    const oldest = pickedImportPaths.values().next().value as string | undefined
    if (oldest !== undefined) {
      pickedImportPaths.delete(oldest)
    }
  }
  pickedImportPaths.add(filePath)
}

function consumePickedImportPath(filePath: string): void {
  if (!pickedImportPaths.has(filePath)) {
    throw new AppError('VALIDATION_ERROR', 'Import file was not selected through the application.')
  }
  pickedImportPaths.delete(filePath)
}

const FIELD_HINTS: Record<ImportField, RegExp> = {
  date: /^date|^transaction date|^posting date|^settlement date/i,
  description: /desc|narration|details|particular|payee|memo|remarks/i,
  amount: /^amount|^value|^total|^debit|^credit|withdrawal|deposit/i,
  type: /^type|account type|^txn type|^dr\/cr|^credit\/debit/i,
  category: /^category|^account|^category name/i,
  notes: /^notes|^note|^reference|^ref|^comment/i,
}

const TYPE_ALIASES: Record<string, string> = {
  cr: 'income',
  credit: 'income',
  deposit: 'income',
  'cash in': 'income',
  dr: 'expense',
  debit: 'expense',
  'cash out': 'expense',
  withdrawal: 'withdrawal',
  draw: 'withdrawal',
  drawings: 'withdrawal',
  'owner draw': 'withdrawal',
  capital: 'capital',
  'owner contribution': 'capital',
  investment: 'capital',
  asset: 'asset',
  assets: 'asset',
  liability: 'liability',
  liabilities: 'liability',
  income: 'income',
  expense: 'expense',
}

function detectFileKind(filePath: string): 'csv' | 'xlsx' {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.csv') {
    return 'csv'
  }
  if (ext === '.xlsx') {
    return 'xlsx'
  }
  throw new AppError('INVALID_FILE', 'Only .csv and .xlsx files are supported.')
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return String(value)
}

async function readRows(filePath: string): Promise<string[][]> {
  const kind = detectFileKind(filePath)

  const fileStat = await stat(filePath)
  if (fileStat.size > MAX_IMPORT_FILE_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 'The file is too large to import (50 MB maximum).')
  }

  if (kind === 'csv') {
    const content = await readFile(filePath, 'utf8')
    const parsed = Papa.parse<unknown[]>(content, { skipEmptyLines: 'greedy' })
    if (parsed.errors.some((e) => e.type === 'Quotes')) {
      throw new AppError('PARSE_ERROR', 'The CSV file could not be read (malformed quotes).')
    }
    const data = (parsed.data as unknown[][]).map((row) => row.map(formatCellValue))
    return data.filter((row) => row.some((cell) => cell.trim() !== ''))
  }

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.readFile(filePath)
  } catch (err) {
    logger.error('import: xlsx read failed', err instanceof Error ? { message: err.message } : String(err))
    throw new AppError('PARSE_ERROR', 'The Excel file could not be read. Make sure it is a valid .xlsx file.')
  }
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new AppError('PARSE_ERROR', 'The Excel file does not contain any sheets.')
  }
  const rows: string[][] = []
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[]
    const mapped = values.slice(1).map(formatCellValue)
    if (mapped.some((cell) => cell.trim() !== '')) {
      rows.push(mapped)
    }
  })
  return rows
}

function splitRows(rows: string[][]): { headers: string[]; data: string[][] } {
  if (rows.length === 0) {
    return { headers: [], data: [] }
  }
  const hasHeader = rows[0].some((cell) => /[A-Za-z]{2,}/.test(cell))
  if (!hasHeader) {
    return { headers: [], data: rows }
  }
  return { headers: rows[0].map((h) => h.trim()), data: rows.slice(1) }
}

function suggestMapping(headers: string[]): Record<ImportField, number> {
  const mapping: Record<ImportField, number> = {
    date: -1,
    description: -1,
    amount: -1,
    type: -1,
    category: -1,
    notes: -1,
  }

  headers.forEach((header, index) => {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field] === -1 && FIELD_HINTS[field].test(header)) {
        mapping[field] = index
        return
      }
    }
  })

  if (mapping.amount === -1 || mapping.date === -1) {
    headers.forEach((header, index) => {
      if (mapping.date === -1 && /date/i.test(header)) mapping.date = index
      if (mapping.amount === -1 && /(amount|value|total|debit|credit)/i.test(header)) mapping.amount = index
    })
  }
  return mapping
}

function cell(row: string[], index: number): string {
  return index >= 0 && index < row.length ? row[index].trim() : ''
}

function hasNumbers(value: string): boolean {
  return /\d/.test(value)
}

export function parseAmount(value: string): number | null {
  const cleaned = value
    .trim()
    .replace(/^\(/, '-')
    .replace(/\)$/, '')
    .replace(/[$€£₱,\s]/g, '')
    .replace(/^\+/, '')
  if (cleaned === '' || !hasNumbers(cleaned)) {
    return null
  }
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) {
    return null
  }
  const abs = Math.abs(parsed)
  if (abs > MAX_AMOUNT) {
    return null
  }
  return abs
}

/** Returns a YYYY-MM-DD string or null when the value cannot be parsed. */
export function parseDateCell(value: string): string | null {
  if (value === '') {
    return null
  }

  // Excel serial date (e.g. 45234)
  if (/^\d{5,6}$/.test(value)) {
    const date = new Date(Math.round((Number(value) - 25569) * 86400000))
    if (Number.isNaN(date.getTime())) {
      return null
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const iso = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (iso) {
    const year = Number(iso[1]); const month = Number(iso[2]); const day = Number(iso[3])
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
      return null
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // MM/DD/YYYY, DD-MM-YYYY, etc.
  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slash) {
    const a = Number(slash[1]); const b = Number(slash[2]); const year = Number(slash[3])
    if (year < 1900 || year > 2100) {
      return null
    }
    // When exactly one part exceeds 12 it must be the day; otherwise default MDY.
    let month: number; let day: number
    if (a > 12) { month = b; day = a }
    else if (b > 12) { month = a; day = b }
    else { month = a; day = b }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // Month name forms: "15 Sep 2026", "Sep 15, 2026"
  const dmyNamed = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/)
  if (dmyNamed) {
    return buildNamedDate(dmyNamed[2], dmyNamed[1], dmyNamed[3])
  }
  const mdyNamed = value.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (mdyNamed) {
    return buildNamedDate(mdyNamed[1], mdyNamed[2], mdyNamed[3])
  }

  return null
}

function buildNamedDate(monthName: string, dayRaw: string, yearRaw: string): string | null {
  const monthIndex = new Date(`${monthName} 1, 2000`).getMonth()
  if (Number.isNaN(monthIndex) || monthIndex < 0) {
    return null
  }
  const year = Number(yearRaw)
  const day = Number(dayRaw)
  if (year < 1900 || year > 2100 || day < 1 || day > 31) {
    return null
  }
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function normalizeTransactionType(value: string): string | null {
  const key = value.toLowerCase().trim()
  if (key === '') {
    return null
  }
  return TYPE_ALIASES[key] ?? key
}

export async function buildImportPreview(filePath: string): Promise<ImportPreview> {
  const { headers, data } = splitRows(await readRows(filePath))
  if (headers.length === 0 && data.length === 0) {
    throw new AppError('PARSE_ERROR', 'The file does not contain any rows.')
  }
  const mapping = suggestMapping(headers)
  recordPickedImportPath(filePath)
  return {
    fileName: path.basename(filePath),
    filePath,
    totalRows: data.length,
    columns: headers,
    sampleRows: data.slice(0, PREVIEW_ROWS),
    suggested: mapping,
  }
}

function isKnownType(value: string): value is (typeof VALID_TYPES)[number] {
  return (VALID_TYPES as readonly string[]).includes(value)
}

export async function confirmImport(req: ImportMapping): Promise<ImportResult> {
  validateMapping(req)
  consumePickedImportPath(req.filePath)

  const { data } = splitRows(await readRows(req.filePath))
  const mapping = req.mapping
  const db = getDb()
  const warnings: string[] = []
  let imported = 0
  let skipped = 0

  const findCategory = db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND type = ?')
  const insertCategory = db.prepare('INSERT INTO categories (name, type, color, is_default) VALUES (?, ?, NULL, 0)')
  const insertTx = db.prepare(
    `INSERT INTO transactions (date, description, category_id, type, amount, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  const runImport = db.transaction((allRows: string[][]) => {
    for (const row of allRows) {
      const dateRaw = cell(row, mapping.date)
      const description = cell(row, mapping.description)
      const amountRaw = cell(row, mapping.amount)
      const typeRaw = cell(row, mapping.type)
      const categoryName = cell(row, mapping.category)
      const notes = cell(row, mapping.notes)

      if (description === '') {
        skipped += 1
        continue
      }

      const date = parseDateCell(dateRaw)
      if (!date) {
        if (warnings.length < MAX_WARNINGS) warnings.push(`Row "${description}": unrecognized date "${dateRaw}".`)
        skipped += 1
        continue
      }

      const amount = parseAmount(amountRaw)
      if (amount === null) {
        if (warnings.length < MAX_WARNINGS) warnings.push(`Row "${description}": amount "${amountRaw}" could not be parsed.`)
        skipped += 1
        continue
      }

      const parsedType = normalizeTransactionType(typeRaw)
      let type: (typeof VALID_TYPES)[number]
      if (parsedType && isKnownType(parsedType)) {
        type = parsedType
      } else if (parsedType) {
        type = 'expense'
        if (warnings.length < MAX_WARNINGS) warnings.push(`Row "${description}": unrecognized type "${typeRaw}" — imported as expense.`)
      } else {
        type = 'expense'
      }

      const name = (categoryName || 'Uncategorized').slice(0, 60)
      let categoryRow = findCategory.get(name, type) as { id: number } | undefined
      if (!categoryRow) {
        const result = insertCategory.run(name, type)
        categoryRow = { id: Number(result.lastInsertRowid) }
      }

      insertTx.run(
        date,
        description.replace(/\s+/g, ' ').slice(0, 255),
        categoryRow.id,
        type,
        amount,
        notes === '' ? null : notes.slice(0, 2000),
        new Date().toISOString(),
        new Date().toISOString(),
      )
      imported += 1
    }
  })

  const limit = Math.min(data.length, MAX_IMPORT_ROWS)
  if (data.length > MAX_IMPORT_ROWS) {
    warnings.push(`File has ${data.length} rows; only the first ${MAX_IMPORT_ROWS} were imported.`)
  }
  runImport(data.slice(0, limit))
  skipped += Math.max(0, data.length - limit)

  logger.info('import completed', {
    fileName: path.basename(req.filePath),
    imported,
    skipped,
    warningCount: warnings.length,
  })
  return { imported, skipped, warnings: warnings.slice(0, MAX_WARNINGS) }
}

function validateMapping(req: ImportMapping): void {
  if (typeof req?.filePath !== 'string' || !/\.(csv|xlsx)$/i.test(req.filePath)) {
    throw new AppError('VALIDATION_ERROR', 'A valid file path is required.')
  }
  if (!req.mapping || typeof req.mapping !== 'object') {
    throw new AppError('VALIDATION_ERROR', 'A column mapping is required.')
  }
  for (const field of IMPORT_FIELDS) {
    if (
      !Number.isInteger(req.mapping[field]) ||
      req.mapping[field] < -1 ||
      req.mapping[field] > MAX_MAPPING_INDEX
    ) {
      throw new AppError('VALIDATION_ERROR', `Invalid mapping for field "${field}".`)
    }
  }
  if (req.mapping.date < 0 || req.mapping.description < 0 || req.mapping.amount < 0) {
    throw new AppError('VALIDATION_ERROR', 'The date, description and amount columns are required.')
  }
}