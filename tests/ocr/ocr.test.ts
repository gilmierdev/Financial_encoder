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
})