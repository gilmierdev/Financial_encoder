import { describe, expect, it, beforeAll, vi } from 'vitest'
import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import ExcelJS from 'exceljs'
import { runMigrations } from '../../electron/database/migrations'
import {
  buildImportPreview,
  confirmImport,
  normalizeTransactionType,
  parseAmount,
  parseDateCell,
} from '../../electron/import/import.service'

const mem = new Database(':memory:')
runMigrations(mem)

vi.mock('../../electron/database/connection', () => ({
  getDb: () => mem,
}))

let tmpDir = ''

function tempFile(name: string): string {
  return path.join(tmpDir, name)
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finenc-import-'))
})

describe('parseAmount', () => {
  it('parses plain integers and decimals', () => {
    expect(parseAmount('1234')).toBe(1234)
    expect(parseAmount('1,234.50')).toBe(1234.5)
    expect(parseAmount('0.25')).toBe(0.25)
  })

  it('strips currency symbols and brackets', () => {
    expect(parseAmount('$45.00')).toBe(45)
    expect(parseAmount('₱1,200')).toBe(1200)
    expect(parseAmount('(500)')).toBe(500)
    expect(parseAmount('12.50€')).toBe(12.5)
  })

  it('returns null for empty or unparsable values', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('---')).toBeNull()
  })
})

describe('parseDateCell', () => {
  it('parses ISO dates', () => {
    expect(parseDateCell('2026-09-15')).toBe('2026-09-15')
    expect(parseDateCell('2026/9/5')).toBe('2026-09-05')
  })

  it('parses slash and dash dates, resolving MDY/DMY ambiguity', () => {
    expect(parseDateCell('9/15/2026')).toBe('2026-09-15')
    expect(parseDateCell('15/9/2026')).toBe('2026-09-15')
    expect(parseDateCell('09-15-2026')).toBe('2026-09-15')
  })

  it('parses month-name dates', () => {
    expect(parseDateCell('15 Sep 2026')).toBe('2026-09-15')
    expect(parseDateCell('Sep 15, 2026')).toBe('2026-09-15')
  })

  it('parses Excel serial numbers', () => {
    expect(parseDateCell('45234')).toBe('2023-11-04')
  })

  it('rejects invalid dates and years out of range', () => {
    expect(parseDateCell('2026-13-40')).toBeNull()
    expect(parseDateCell('99/99/99')).toBeNull()
    expect(parseDateCell('')).toBeNull()
    expect(parseDateCell('not a date')).toBeNull()
  })
})

describe('normalizeTransactionType', () => {
  it('maps common aliases', () => {
    expect(normalizeTransactionType('CR')).toBe('income')
    expect(normalizeTransactionType('dr')).toBe('expense')
    expect(normalizeTransactionType('Deposit')).toBe('income')
    expect(normalizeTransactionType('WITHDRAWAL')).toBe('withdrawal')
  })

  it('passes through known types and unknown values verbatim', () => {
    expect(normalizeTransactionType('expense')).toBe('expense')
    expect(normalizeTransactionType('misc')).toBe('misc')
    expect(normalizeTransactionType('')).toBeNull()
  })
})

describe('buildImportPreview', () => {
  it('detects columns and samples rows from a CSV', async () => {
    const file = tempFile('sample.csv')
    fs.writeFileSync(file, [
      'Date,Description,Amount,Type,Category',
      '2026-09-01,Salary,25000,income,Salary',
      '2026-09-02,Groceries,850.50,expense,Food',
      '',
    ].join('\n'), 'utf8')

    const preview = await buildImportPreview(file)
    expect(preview.totalRows).toBe(2)
    expect(preview.columns).toEqual(['Date', 'Description', 'Amount', 'Type', 'Category'])
    expect(preview.sampleRows[0][1]).toBe('Salary')
    expect(preview.suggested.date).toBe(0)
    expect(preview.suggested.description).toBe(1)
    expect(preview.suggested.amount).toBe(2)
    expect(preview.suggested.type).toBe(3)
    expect(preview.suggested.category).toBe(4)
  })

  it('reads an .xlsx workbook created by exceljs', async () => {
    const file = tempFile('sample.xlsx')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Transactions')
    sheet.addRow(['Date', 'Description', 'Amount', 'Type', 'Category'])
    sheet.addRow([new Date(2026, 8, 15), 'Rent', '12000', 'expense', 'Housing'])
    await workbook.xlsx.writeFile(file)

    const preview = await buildImportPreview(file)
    expect(preview.totalRows).toBe(1)
    expect(preview.sampleRows[0][0]).toBe('2026-09-15')
    expect(preview.sampleRows[0][1]).toBe('Rent')
    expect(preview.suggested.amount).toBe(2)
  })

  it('rejects unsupported extensions', async () => {
    await expect(buildImportPreview(tempFile('data.txt'))).rejects.toThrow()
  })
})

describe('confirmImport', () => {
  it('imports rows, creates missing categories, and reports skipped rows', async () => {
    const file = tempFile('confirm.csv')
    fs.writeFileSync(file, [
      'date,description,amount,type,category',
      '2026-09-01,Consulting fee,15000,income,Consulting',
      '2026-09-02,Coffee,120,expense,Food',
      '2026-09-03,Bad amount,not-a-number,expense,Food',
      '2026-09-04,Unknown type row,50,foobar,Sundries',
      '2026-09-05,Office supplies,800,expense,Office',
    ].join('\n'), 'utf8')

    await buildImportPreview(file)

    const result = await confirmImport({
      filePath: file,
      mapping: { date: 0, description: 1, amount: 2, type: 3, category: 4, notes: -1 },
    })

    expect(result.imported).toBe(4)
    expect(result.skipped).toBe(1)
    expect(result.warnings.some((w) => w.includes('not-a-number'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('foobar'))).toBe(true)

    const counts = mem.prepare('SELECT type, COUNT(*) AS n FROM transactions GROUP BY type').all() as { type: string; n: number }[]
    const byType = Object.fromEntries(counts.map((c) => [c.type, c.n]))
    expect(byType.income).toBe(1)
    expect(byType.expense).toBe(3)

    const cats = mem.prepare('SELECT name, type FROM categories ORDER BY name').all() as { name: string; type: string }[]
    expect(cats).toContainEqual({ name: 'Consulting', type: 'income' })
    expect(cats).toContainEqual({ name: 'Food', type: 'expense' })
    expect(cats).toContainEqual({ name: 'Sundries', type: 'expense' })

    const rows = mem.prepare('SELECT amount FROM transactions WHERE description = ?').all('Consulting fee') as { amount: number }[]
    expect(rows[0].amount).toBe(15000)
  })

  it('rejects confirming a file that was never picked in this session', async () => {
    const file = tempFile('never-picked.csv')
    fs.writeFileSync(file, 'date,description,amount\n2026-09-01,Rent,100\n', 'utf8')
    await expect(
      confirmImport({
        filePath: file,
        mapping: { date: 0, description: 1, amount: 2, type: -1, category: -1, notes: -1 },
      }),
    ).rejects.toThrowError(/not selected/)
  })
})