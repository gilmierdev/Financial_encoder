import { describe, expect, it, beforeAll, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import Database from 'better-sqlite3'
import ExcelJS from 'exceljs'
import { initDatabase, getDb } from '../../electron/database/connection'
import {
  createBackup,
  deleteBackup,
  exportBackup,
  listBackups,
  restoreBackup,
  restoreFromFile,
  validateBackupFile,
} from '../../electron/database/backup.service'
import { resetAllData } from '../../electron/database/reset.service'
import { getAllSettings } from '../../electron/database/settings'
import { createCategory, listCategories } from '../../electron/categories/category.service'
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listAllTransactions,
  listTransactions,
  updateTransaction,
} from '../../electron/transactions/transaction.service'
import { AppError } from '../../electron/services/ipc-handler'
import {
  buildCsvReport,
  buildHtmlReport,
  buildReportData,
  buildXlsxReport,
  validateExportFilter,
} from '../../electron/export/report.service'

const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => {
  const os = require('os') as typeof import('os')
  const path = require('path') as typeof import('path')
  return {
    app: {
      getPath: (name: string): string =>
        name === 'userData' ? state.userData : path.join(os.tmpdir(), `finenc-test-${name}`),
    },
  }
})

beforeAll(() => {
  state.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'finenc-crud-'))
  initDatabase()
})

let txCounter = 0
function seedTransaction(overrides: Partial<Parameters<typeof createTransaction>[0]> = {}) {
  txCounter += 1
  const incomeCat = listCategories('income')[0]
  const expenseCat = listCategories('expense')[0]
  const isIncome = txCounter % 2 === 0
  return createTransaction({
    date: `2026-09-${String((txCounter % 28) + 1).padStart(2, '0')}`,
    description: `Seed tx ${txCounter}${overrides.description ? ` ${overrides.description}` : ''}`,
    category_id: isIncome ? incomeCat.id : expenseCat.id,
    type: isIncome ? 'income' : 'expense',
    amount: 100 + txCounter,
    notes: null,
    ...overrides,
  })
}

describe('category service', () => {
  it('seeds default categories on first init', () => {
    const cats = listCategories()
    expect(cats.length).toBeGreaterThan(15)
    expect(cats.some((c) => c.name === 'Salary' && c.type === 'income')).toBe(true)
  })

  it('creates a category and is idempotent on name+type', () => {
    const a = createCategory('  Unique Cat  ', 'expense')
    const b = createCategory('unique cat', 'expense')
    const c = createCategory('Unique Cat', 'income')
    expect(b.id).toBe(a.id)
    expect(c.id).not.toBe(a.id)
  })

  it('rejects invalid category input', () => {
    expect(() => createCategory('   ', 'expense')).toThrowError(AppError)
    expect(() => createCategory('x'.repeat(61), 'expense')).toThrowError(AppError)
    expect(() => createCategory('Valid', 'foobar' as 'expense')).toThrowError(AppError)
  })
})

describe('transaction CRUD', () => {
  it('creates and reads back a transaction with its category joined', () => {
    const tx = seedTransaction()
    const read = getTransaction(tx.id)
    expect(read?.description).toBe(tx.description)
    expect(read?.category_name.length).toBeGreaterThan(0)
    expect(read?.amount).toBe(tx.amount)
  })

  it('validates input before saving', () => {
    const cat = listCategories('expense')[0]
    const base = {
      date: '2026-09-01',
      description: 'val',
      category_id: cat.id,
      type: 'expense' as const,
      amount: 10,
      notes: null,
    }
    expect(() => createTransaction({ ...base, date: 'not-a-date' })).toThrowError(AppError)
    expect(() => createTransaction({ ...base, description: ' ' })).toThrowError(AppError)
    expect(() => createTransaction({ ...base, amount: -5 })).toThrowError(AppError)
    expect(() => createTransaction({ ...base, category_id: -1 })).toThrowError(AppError)
    expect(() => createTransaction({ ...base, type: 'nope' as 'expense' })).toThrowError(AppError)
  })

  it('rejects a transaction whose category does not exist', () => {
    expect(() =>
      createTransaction({
        date: '2026-09-01',
        description: 'ghost category',
        category_id: 999999,
        type: 'expense',
        amount: 1,
        notes: null,
      }),
    ).toThrowError(/does not exist/)
  })

  it('updates only the given fields and returns null for a missing row', () => {
    const tx = seedTransaction({ description: 'update-me' })
    const updated = updateTransaction(tx.id, { amount: 543.21, notes: 'note added' })
    expect(updated?.amount).toBe(543.21)
    expect(updated?.notes).toBe('note added')
    expect(updated?.description).toBe(tx.description)

    const renamed = updateTransaction(tx.id, { description: '  padded desc  ' })
    expect(renamed?.description).toBe('padded desc')

    expect(updateTransaction(999999, { amount: 1 })).toBeNull()
  })

  it('deletes a transaction and reports whether it existed', () => {
    const tx = seedTransaction({ description: 'delete-me' })
    expect(deleteTransaction(tx.id)).toBe(true)
    expect(getTransaction(tx.id)).toBeNull()
    expect(deleteTransaction(tx.id)).toBe(false)
  })

  it('filters by type, category, search term and date range', () => {
    seedTransaction({ description: 'Starbucks coffee run' })
    const expenseCat = listCategories('expense')[0]

    const byType = listTransactions({ type: ['income'], page_size: 500 })
    expect(byType.transactions.every((t) => t.type === 'income')).toBe(true)

    const byCat = listTransactions({ category_id: [expenseCat.id], page_size: 500 })
    expect(byCat.transactions.every((t) => t.category_id === expenseCat.id)).toBe(true)

    const bySearch = listTransactions({ search_term: 'Starbucks', page_size: 10 })
    expect(bySearch.transactions.map((t) => t.description)).toContain('Starbucks coffee run')

    const byDates = listTransactions({ date_from: '2026-09-01', date_to: '2026-09-10', page_size: 500 })
    expect(byDates.transactions.length).toBeGreaterThan(0)

    const byDates2 = listTransactions({ date_from: '2030-01-01', date_to: '2030-01-31' })
    expect(byDates2.total).toBe(0)
  })

  it('paginates and keeps total consistent', () => {
    seedTransaction({ description: 'pagination-row' })
    const page1 = listTransactions({ search_term: 'pagination-row', page: 1, page_size: 3 })
    const page2 = listTransactions({ search_term: 'pagination-row', page: 2, page_size: 3 })
    expect(page1.total).toBe(page1.transactions.length + page2.transactions.length)
    expect(page1.total_pages).toBeGreaterThanOrEqual(1)
  })

  it('listAllTransactions walks every page', () => {
    for (let i = 0; i < 15; i += 1) {
      seedTransaction({ description: 'bulk-page' })
    }
    const all = listAllTransactions({ search_term: 'bulk-page' })
    const single = listTransactions({ search_term: 'bulk-page', page_size: 200 })
    expect(all.length).toBe(single.total)
  })
})

describe('backup service (real files on disk)', () => {
  it('creates a backup file and records it', async () => {
    seedTransaction({ description: 'backup-me' })
    const record = await createBackup()
    expect(record.filename).toMatch(/^backup-.*\.db$/)
    expect(fs.existsSync(record.path)).toBe(true)
    expect(fs.statSync(record.path).size).toBeGreaterThan(0)
    expect(listBackups().some((b) => b.id === record.id)).toBe(true)
    return record
  })

  it('restores the backup and keeps a pre-restore safety copy', async () => {
    const before = listTransactions({ page_size: 500 }).transactions.length
    const backup = await createBackup()

    seedTransaction({ description: 'only-in-live-db' })
    expect(listTransactions({ search_term: 'only-in-live-db' }).total).toBe(1)

    const restored = await restoreBackup(backup.id)
    expect(restored.restored).toBe(true)
    expect(listTransactions({ search_term: 'only-in-live-db' }).total).toBe(0)

    const after = listTransactions({ page_size: 500 }).transactions.length
    expect(after).toBe(before)

    const dirs = getDb().name
    const backupsDir = path.join(path.dirname(dirs), 'backups')
    expect(fs.readdirSync(backupsDir).some((f) => f.startsWith('pre-restore-'))).toBe(true)
  })

  it('errors on unknown backups and delete on missing ids', async () => {
    await expect(restoreBackup(999999)).rejects.toThrowError(/no longer exists/)
    expect(deleteBackup(999999)).toBe(false)
  })

  it('deletes a backup file and its record', async () => {
    const backup = await createBackup()
    expect(deleteBackup(backup.id)).toBe(true)
    expect(fs.existsSync(backup.path)).toBe(false)
    expect(listBackups().some((b) => b.id === backup.id)).toBe(false)
  })

  it('validateBackupFile accepts a real backup and rejects bad files', async () => {
    const backup = await createBackup()
    expect(() => validateBackupFile(backup.path)).not.toThrow()

    const textFile = path.join(path.dirname(backup.path), 'fake.txt')
    fs.writeFileSync(textFile, 'this is not a sqlite file at all')
    expect(() => validateBackupFile(textFile)).toThrowError(/only.*\.febak/i)

    expect(() => validateBackupFile(path.join(path.dirname(backup.path), 'missing.db'))).toThrowError(/does not exist/)

    // A valid SQLite file that is not a Financial Encoder backup.
    const junkDb = path.join(path.dirname(backup.path), 'junk.db')
    const junk = new Database(junkDb)
    junk.close()
    expect(() => validateBackupFile(junkDb)).toThrowError(/not a Financial Encoder backup/)
  })

  it('exportBackup copies a snapshot to the chosen destination', async () => {
    seedTransaction({ description: 'export-me' })
    const dest = path.join(path.dirname(getDb().name), 'backups', 'FinancialEncoder-Backup-2026-09-16.febak')
    const exported = await exportBackup(dest)
    expect(exported.filePath).toBe(dest)
    expect(fs.existsSync(dest)).toBe(true)
    expect(exported.bytes).toBeGreaterThan(0)
    fs.rmSync(dest, { force: true })
  })

  it('restores from an external file and keeps a pre-restore safety copy', async () => {
    const before = listTransactions({ page_size: 500 }).transactions.length
    const backup = await createBackup()
    const extFile = path.join(path.dirname(backup.path), 'FinancialEncoder-Backup-external.febak')
    fs.copyFileSync(backup.path, extFile)

    seedTransaction({ description: 'only-in-live-db-again' })
    expect(listTransactions({ search_term: 'only-in-live-db-again' }).total).toBe(1)

    const result = await restoreFromFile(extFile)
    expect(result.restored).toBe(true)
    expect(result.filename).toBe('FinancialEncoder-Backup-external.febak')
    expect(listTransactions({ search_term: 'only-in-live-db-again' }).total).toBe(0)

    const after = listTransactions({ page_size: 500 }).transactions.length
    expect(after).toBe(before)

    const dirs = path.dirname(getDb().name)
    const backupsDir = path.join(dirs, 'backups')
    expect(fs.readdirSync(backupsDir).some((f) => f.startsWith('pre-restore-'))).toBe(true)
  })

  it('rejects restoring a corrupt or foreign file', async () => {
    const badFile = path.join(path.dirname(getDb().name), 'bad.febak')
    fs.writeFileSync(badFile, 'garbage data that is definitely not a backup')
    await expect(restoreFromFile(badFile)).rejects.toThrowError(/not a valid Financial Encoder backup/)
  })
})

describe('report building and export', () => {
  it('validates export filters', () => {
    expect(validateExportFilter(undefined)).toEqual({})
    expect(validateExportFilter({ date_from: '2026-01-01', date_to: '2026-12-31' })).toEqual({
      date_from: '2026-01-01',
      date_to: '2026-12-31',
    })
    expect(() => validateExportFilter('x')).toThrowError(AppError)
    expect(() => validateExportFilter({ date_from: '01/01/2026' })).toThrowError(AppError)
    expect(() => validateExportFilter({ date_from: '2026-02-01', date_to: '2026-01-01' })).toThrowError(AppError)
  })

  it('builds report data with totals, monthly sums and category breakdown', () => {
    const incomeCat = listCategories('income')[0]
    const before = listTransactions({ page_size: 500 }).total
    createTransaction({
      date: '2026-06-15',
      description: 'June invoice',
      category_id: incomeCat.id,
      type: 'income',
      amount: 7777,
      notes: null,
    })
    const data = buildReportData({ date_from: '2026-06-01', date_to: '2026-06-30' })

    const june = data.monthly.find((m) => m.month === '2026-06')
    expect(june?.income).toBeGreaterThanOrEqual(7777)
    expect(data.totals.income).toBeGreaterThanOrEqual(7777)
    expect(data.categories.some((c) => c.total === 7777 && c.type === 'income')).toBe(true)
    expect(before).toBeGreaterThanOrEqual(0)
  })

  it('emits CSV with proper quoting and section headers', () => {
    const data = buildReportData({ date_from: '2026-09-01', date_to: '2026-09-30' })
    const csv = buildCsvReport(data)
    expect(csv).toContain('SUMMARY')
    expect(csv).toContain('MONTHLY SUMMARY')
    expect(csv).toContain('CATEGORY BREAKDOWN')
    expect(csv).toContain('TRANSACTIONS')

    const quoted = buildCsvReport({ ...data, transactions: [
      {
        id: 1, date: '2026-09-01', description: 'Contains, comma and "quote"', category_id: 1, type: 'expense',
        category_name: 'Food', amount: 12.5, notes: null, created_at: '', updated_at: '',
      },
    ] })
    expect(quoted).toContain('"Contains, comma and ""quote"""')
  })

  it('escapes HTML in the print report (XSS-safe)', () => {
    const evil = '<script>alert(1)</script>'
    const data = buildReportData({})
    const html = buildHtmlReport({ ...data, title: evil, periodLabel: evil, transactions: [
      {
        id: 1, date: evil, description: evil, category_id: 1, type: 'expense',
        category_name: evil, amount: 1, notes: evil, created_at: '', updated_at: '',
      },
    ] })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('builds a readable XLSX workbook', async () => {
    const buf = await buildXlsxReport(buildReportData({}))
    expect(buf.length).toBeGreaterThan(100)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buf as unknown as ArrayBuffer)
    const names = workbook.worksheets.map((s) => s.name)
    expect(names).toContain('Summary')
    expect(names).toContain('Category Breakdown')
    expect(names).toContain('Transactions')
    expect(workbook.getWorksheet('Transactions')!.rowCount).toBeGreaterThan(1)
  })
})

describe('data reset (start fresh)', () => {
  it('wipes all data, reseeds defaults, and keeps one safety backup', async () => {
    for (let i = 0; i < 3; i += 1) {
      seedTransaction({ description: 'reset-me' })
    }
    await createBackup()
    createCategory('Reset Target', 'expense')
    expect(listTransactions({ page_size: 500 }).total).toBeGreaterThan(0)
    expect(listBackups().length).toBeGreaterThanOrEqual(1)

    const result = await resetAllData()
    expect(result.safetyBackup).toBeTruthy()
    expect(result.deleted.transactions).toBeGreaterThanOrEqual(3)
    expect(result.deleted.categories).toBeGreaterThanOrEqual(1)
    expect(result.deleted.backups).toBeGreaterThanOrEqual(1)
    expect(result.status.connected).toBe(true)

    expect(listTransactions({ page_size: 500 }).total).toBe(0)
    expect(listCategories().some((c) => c.name === 'Reset Target')).toBe(false)
    expect(listCategories().length).toBeGreaterThan(15)
    expect(getAllSettings().currency).toBe('PHP')
    expect(getAllSettings().appName).toBe('Financial Encoder')

    const backups = listBackups()
    expect(backups.length).toBe(1)
    expect(backups[0].filename).toMatch(/^pre-reset-.*\.db$/)
  })
})