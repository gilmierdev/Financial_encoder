import { describe, expect, it, beforeAll, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import PDFDocument from 'pdfkit'
import { parseDocumentLines, readDocument, resolveOcrLangPath } from '../../electron/ocr/ocr.service'

vi.mock('electron', () => {
  const os = require('os') as typeof import('os')
  const path = require('path') as typeof import('path')
  return {
    app: {
      isPackaged: false,
      getAppPath: () => process.cwd(),
    },
  }
})

describe('resolveOcrLangPath', () => {
  it('points at a directory that exists in the workspace', () => {
    const result = resolveOcrLangPath()
    expect(result).toBe(path.join(process.cwd(), 'resources', 'ocr'))
    expect(fs.existsSync(path.join(result!, 'eng.traineddata.gz'))).toBe(true)
  })
})

let tmpDir = ''

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finenc-ocr-'))
})

function tempFile(name: string): string {
  return path.join(tmpDir, name)
}

async function writePdf(file: string, lines: string[]): Promise<void> {
  const doc = new PDFDocument()
  const stream = fs.createWriteStream(file)
  doc.pipe(stream)
  for (const line of lines) {
    doc.text(line)
  }
  doc.end()
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })
}

describe('readDocument (PDF text extraction)', () => {
  it('extracts copyable text from a generated PDF', async () => {
    const file = tempFile('receipt.pdf')
    await writePdf(file, [
      'ACME Coffee',
      'Cappuccino 240.00',
      'Croissant 180.50',
      'TOTAL 420.50',
    ])

    const result = await readDocument(file)
    expect(result.kind).toBe('pdf')
    expect(result.method).toBe('text')
    expect(result.text).toContain('Cappuccino')
    expect(result.text).toContain('TOTAL')
    expect(result.lines.length).toBeGreaterThanOrEqual(4)
  }, 30000)

  it('rejects unsupported file types', async () => {
    const file = tempFile('data.txt')
    fs.writeFileSync(file, 'hello', 'utf8')
    await expect(readDocument(file)).rejects.toThrow()
  })
})

describe('parseDocumentLines', () => {
  it('derives date, amount and description from raw lines', () => {
    const rows = parseDocumentLines(
      [
        'ACME Coffee',
        '2026-09-15 Cappuccino $240.00',
        'Croissant 180.50 PHP',
        'TOTAL 420.50',
        'Plain text with no numbers',
        'No integer here',
      ].join('\n'),
      'receipt.pdf',
    )

    const cappuccino = rows.find((r) => r.description.includes('Cappuccino'))
    expect(cappuccino).toBeDefined()
    expect(cappuccino?.date).toBe('2026-09-15')
    expect(cappuccino?.amount).toBe(240)

    const croissant = rows.find((r) => r.description.includes('Croissant'))
    expect(croissant?.amount).toBe(180.5)

    // Header lines and TOTAL rows are ignored.
    expect(rows.some((r) => r.description.includes('ACME'))).toBe(false)
    expect(rows.some((r) => r.description.includes('TOTAL'))).toBe(false)
  })

  it('returns an empty list when there is nothing parseable', () => {
    expect(parseDocumentLines('Just some words\n\nmore words', 'doc.pdf')).toEqual([])
  })

  it('collapses a GCash receipt into a single structured row', () => {
    const rows = parseDocumentLines(
      [
        'GCash',
        'Send Money',
        'To: JUAN DELA CRUZ',
        'Date Sep 17, 2026 10:32 AM',
        'Reference No. GX2026091712345',
        'Total: PHP 1,500.00',
      ].join('\n'),
      'gcash.png',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(1500)
    expect(rows[0].date).toBe('2026-09-17')
    expect(rows[0].description).toContain('GCash')
    expect(rows[0].description).toContain('Send Money')
    expect(rows[0].description).toContain('JUAN DELA CRUZ')
  })

  it('parses a cash-in GCash receipt using labeled amount and numeric date', () => {
    const rows = parseDocumentLines(
      [
        'GCash',
        'Cash In',
        'From: BDO Unibank',
        'Date: 09/17/2026',
        'Reference No. 09171234567',
        'Amount: P2,000.00',
      ].join('\n'),
      'gcash-cashin.png',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(2000)
    expect(rows[0].date).toBe('2026-09-17')
    expect(rows[0].description).toContain('Cash In')
  })

  it('extracts the amount due and due date from a billing statement', () => {
    const rows = parseDocumentLines(
      [
        'MERALCO',
        'Monthly Billing Statement',
        'Account Number: 1234-5678-9012',
        'Due Date: 2026-10-15',
        'Previous Bill 1,200.00',
        'Amount Due 1,438.75',
      ].join('\n'),
      'bill.pdf',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(1438.75)
    expect(rows[0].date).toBe('2026-10-15')
    expect(rows[0].description).toContain('MERALCO')
  })

  it('skips reference and mobile-number lines while keeping itemized rows', () => {
    const rows = parseDocumentLines(
      [
        'ACME Coffee',
        '2026-09-15 Cappuccino $240.00',
        'Reference No. 9876543210',
        'Mobile: 09171234567',
        'TOTAL 420.50',
      ].join('\n'),
      'receipt.pdf',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Cappuccino')
    expect(rows[0].amount).toBe(240)
    expect(rows[0].date).toBe('2026-09-15')
  })

  it('normalizes slash dates to YYYY-MM-DD', () => {
    const rows = parseDocumentLines('09/17/2026 Tea 5.50', 'receipt.pdf')
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-09-17')
    expect(rows[0].amount).toBe(5.5)
  })

  it('parses a GCash bill-payment receipt with OCR noise', () => {
    const rows = parseDocumentLines(
      [
        '10:11 9 FTE',
        'GBills X',
        'PLDT &',
        'Paid via GCash',
        'Account Number 0375851636',
        'Email Address gilmiercabil@gmail.com',
        'Bill Amount 1,700.00',
        'Fee 7.00',
        'Total # 1,707.00',
        '+ Save Biller',
        '',
        'Date Aug 5, 2026 10:11 AM',
        'GCash Reference No. 696355712',
        'Bayad Reference No. ETQP26217pB8KnfC',
        '',
        '253g (gCO2e) wv',
        'HO) Temu',
        'GCashisa (®payadeacnice the right is only the name and billing ammount',
      ].join('\n'),
      'gcash-bill.png',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(1707)
    expect(rows[0].date).toBe('2026-08-05')
    expect(rows[0].description).toContain('Bill Payment')
    expect(rows[0].description).toContain('PLDT')
  })
})