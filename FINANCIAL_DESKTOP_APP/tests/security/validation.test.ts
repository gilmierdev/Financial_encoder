import { describe, expect, it, beforeAll, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { initDatabase } from '../../electron/database/connection'
import { setSetting } from '../../electron/database/settings'
import { createDailyBackupIfDue, listBackups } from '../../electron/database/backup.service'
import { listCategories } from '../../electron/categories/category.service'
import { createTransaction, listTransactions } from '../../electron/transactions/transaction.service'
import {
  buildImportPreview,
  confirmImport,
  parseAmount,
  type ImportMapping,
} from '../../electron/import/import.service'
import { parseDocumentLines } from '../../electron/ocr/ocr.service'
import {
  isValidAmount,
  isValidDateString,
  isSafePositiveInt,
  MAX_AMOUNT,
} from '../../electron/services/validation'
import { AppError } from '../../electron/services/ipc-handler'

const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => {
  const os = require('os') as typeof import('os')
  const path = require('path') as typeof import('path')
  return {
    app: {
      getPath: (name: string): string =>
        name === 'userData' ? state.userData : path.join(os.tmpdir(), `finenc-sec-${name}`),
    },
  }
})

beforeAll(() => {
  state.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'finenc-security-'))
  initDatabase()
})

function baseTx(overrides: Record<string, unknown> = {}) {
  const cat = listCategories('expense')[0]
  return {
    date: '2026-09-15',
    description: 'security test',
    category_id: cat.id,
    type: 'expense' as const,
    amount: 50,
    notes: null,
    ...overrides,
  }
}

describe('shared validation helpers', () => {
  it('validates calendar-correct dates', () => {
    expect(isValidDateString('2026-09-15')).toBe(true)
    expect(isValidDateString('2026-02-28')).toBe(true)
    expect(isValidDateString('2028-02-29')).toBe(true)
    expect(isValidDateString('2026-02-29')).toBe(false)
    expect(isValidDateString('2026-02-31')).toBe(false)
    expect(isValidDateString('2026-13-01')).toBe(false)
    expect(isValidDateString('2026-00-10')).toBe(false)
    expect(isValidDateString('not-a-date')).toBe(false)
    expect(isValidDateString('0999-01-01')).toBe(false)
    expect(isValidDateString(20260915)).toBe(false)
    expect(isValidDateString(null)).toBe(false)
  })

  it('validates positive safe integers', () => {
    expect(isSafePositiveInt(1)).toBe(true)
    expect(isSafePositiveInt(9007199254740991)).toBe(true)
    expect(isSafePositiveInt(0)).toBe(false)
    expect(isSafePositiveInt(-5)).toBe(false)
    expect(isSafePositiveInt(1.5)).toBe(false)
    expect(isSafePositiveInt(NaN)).toBe(false)
    expect(isSafePositiveInt(Infinity)).toBe(false)
    expect(isSafePositiveInt('1')).toBe(false)
    expect(isSafePositiveInt(null)).toBe(false)
    expect(isSafePositiveInt(9007199254740992)).toBe(false)
  })

  it('validates amounts within a sane upper bound', () => {
    expect(isValidAmount(0)).toBe(true)
    expect(isValidAmount(MAX_AMOUNT)).toBe(true)
    expect(isValidAmount(-1)).toBe(false)
    expect(isValidAmount(NaN)).toBe(false)
    expect(isValidAmount(Infinity)).toBe(false)
    expect(isValidAmount(MAX_AMOUNT + 1)).toBe(false)
    expect(isValidAmount('50')).toBe(false)
  })
})

describe('transaction input hardening', () => {
  it('rejects out-of-range calendar dates', () => {
    expect(() => createTransaction(baseTx({ date: '2026-02-31' }))).toThrowError(AppError)
    expect(() => createTransaction(baseTx({ date: '2026-13-01' }))).toThrowError(AppError)
    expect(() => createTransaction(baseTx({ date: '1499-01-01' }))).toThrowError(AppError)
  })

  it('rejects non-finite and oversized amounts', () => {
    expect(() => createTransaction(baseTx({ amount: NaN }))).toThrowError(AppError)
    expect(() => createTransaction(baseTx({ amount: Infinity }))).toThrowError(AppError)
    expect(() => createTransaction(baseTx({ amount: MAX_AMOUNT + 1 }))).toThrowError(AppError)
  })

  it('rejects non-string notes', () => {
    expect(() => createTransaction(baseTx({ notes: 12345 }))).toThrowError(AppError)
    expect(() => createTransaction(baseTx({ notes: { x: 1 } }))).toThrowError(AppError)
  })

  it('rejects invalid date filters in listTransactions', () => {
    expect(() => listTransactions({ date_from: '2026-02-31' })).toThrowError(AppError)
    expect(() => listTransactions({ date_to: '2026-13-01' })).toThrowError(AppError)
  })

  it('rejects an oversized search term', () => {
    expect(() => listTransactions({ search_term: 'x'.repeat(201) })).toThrowError(AppError)
  })
})

describe('settings hardening', () => {
  it('accepts valid display date formats and rejects arbitrary text', () => {
    expect(() => setSetting('dateFormat', 'YYYY-MM-DD')).not.toThrow()
    expect(() => setSetting('dateFormat', 'MM/DD/YYYY')).not.toThrow()
    expect(() => setSetting('dateFormat', 'DD/MM/YYYY')).not.toThrow()
    expect(() => setSetting('dateFormat', 'alert(1)')).toThrowError()
    expect(() => setSetting('dateFormat', 'abcd\ndef')).toThrowError()
  })

  it('requires export folder to be empty or absolute', () => {
    expect(() => setSetting('defaultExportFolder', '')).not.toThrow()
    const absFolder = path.join(os.tmpdir(), 'finenc-exports-sec')
    expect(() => setSetting('defaultExportFolder', absFolder)).not.toThrow()
    expect(() => setSetting('defaultExportFolder', 'relative/folder')).toThrowError()
    expect(() => setSetting('defaultExportFolder', 'bad\u0000folder')).toThrowError()
  })
})

describe('import hardening', () => {
  it('caps parsed amounts at MAX_AMOUNT', () => {
    expect(parseAmount('1234')).toBe(1234)
    expect(parseAmount(String(MAX_AMOUNT))).toBe(MAX_AMOUNT)
    expect(parseAmount(String(MAX_AMOUNT + 1))).toBeNull()
    expect(parseAmount('1e15')).toBeNull()
  })

  it('rejects confirming a file that was never picked', async () => {
    const mapping: ImportMapping = {
      filePath: path.join(os.tmpdir(), 'never-picked.csv'),
      mapping: { date: 1, description: 2, amount: 3, type: -1, category: -1, notes: -1 },
    }
    await expect(confirmImport(mapping)).rejects.toThrowError(/not selected/)
  })

  it('accepts a picked file end-to-end', async () => {
    const csvPath = path.join(os.tmpdir(), 'finenc-sec-import.csv')
    fs.writeFileSync(csvPath, 'date,description,amount\n2026-09-15,Coffee,2.50\n')
    const preview = await buildImportPreview(csvPath)
    expect(preview.filePath).toBe(csvPath)
    const result = await confirmImport({ filePath: csvPath, mapping: preview.suggested })
    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(0)
  })

  it('rejects re-using the same picked file path twice', async () => {
    const csvPath = path.join(os.tmpdir(), 'finenc-sec-once.csv')
    fs.writeFileSync(csvPath, 'date,description,amount\n2026-09-15,Once,1.00\n')
    const mapping = { date: 0, description: 1, amount: 2, type: -1, category: -1, notes: -1 }
    await buildImportPreview(csvPath)
    await confirmImport({ filePath: csvPath, mapping })
    await expect(confirmImport({ filePath: csvPath, mapping })).rejects.toThrowError(/not selected/)
  })
})

describe('OCR parse hardening', () => {
  it('caps amounts and drops invalid calendar dates', () => {
    const lines = parseDocumentLines(
      '2026-02-31 Coffee 1,000,000,000,000\n2026-09-15 Tea 5.50\n',
      'doc.pdf',
    )
    expect(lines).toHaveLength(2)

    const bad = lines.find((l) => l.description === 'Coffee')
    expect(bad?.date).toBeNull()
    expect(bad?.amount).toBeNull()

    const good = lines.find((l) => l.description === 'Tea')
    expect(good?.date).toBe('2026-09-15')
    expect(good?.amount).toBe(5.5)
  })
})

describe('automatic backup', () => {
  it('creates one automatic backup per 24h window', async () => {
    const first = await createDailyBackupIfDue()
    expect(first?.filename).toMatch(/^auto-.*\.db$/)
    expect(fs.existsSync(first!.path)).toBe(true)

    const second = await createDailyBackupIfDue()
    expect(second).toBeNull()

    const auto = listBackups().filter((b) => b.filename.startsWith('auto-'))
    expect(auto.length).toBe(1)
  })
})