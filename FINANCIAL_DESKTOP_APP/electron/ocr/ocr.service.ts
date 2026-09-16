import * as path from 'path'
import * as fs from 'fs'
import { readFile } from 'fs/promises'
import { createWorker } from 'tesseract.js'
import { app } from 'electron'
import { AppError } from '../services/ipc-handler'
import { logger } from '../services/logger.service'
import { isValidDateString, MAX_AMOUNT, MAX_OCR_FILE_BYTES } from '../services/validation'

/**
 * Prefers locally bundled OCR language data so OCR works offline. Falls back
 * to null, letting tesseract.js download data from its CDN on first use.
 */
export function resolveOcrLangPath(): string | null {
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, 'ocr')
    : path.join(app.getAppPath(), 'resources', 'ocr')
  if (fs.existsSync(candidate)) {
    return candidate
  }
  return null
}

export type DocumentKind = 'pdf' | 'image'

export interface ReadDocumentResult {
  fileName: string
  filePath: string
  kind: DocumentKind
  method: 'text' | 'ocr'
  text: string
  lines: string[]
}

export interface ParsedDocumentLine {
  order: number
  date: string | null
  description: string
  amount: number | null
  type: string
  category: string
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff'])
const PDF_EXTS = new Set(['.pdf'])

function classifyFile(filePath: string): DocumentKind {
  const ext = path.extname(filePath).toLowerCase()
  if (PDF_EXTS.has(ext)) {
    return 'pdf'
  }
  if (IMAGE_EXTS.has(ext)) {
    return 'image'
  }
  throw new AppError('INVALID_FILE', 'Only PDF, PNG, JPG, JPEG, WEBP, BMP or TIFF files are supported.')
}

async function loadPdfJs(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> {
  // The legacy build is ESM-only, so it must be imported dynamically from the
  // CommonJS main process.
  return import('pdfjs-dist/legacy/build/pdf.mjs')
}

function groupIntoLines(items: { str: string; transform?: number[] }[]): string[] {
  const rows = new Map<number, { y: number; text: string }>()
  for (const item of items) {
    if (!item.str) {
      continue
    }
    const y = item.transform?.[5] ?? 0
    const key = Math.round(y / 3) * 3
    const entry = rows.get(key) ?? { y, text: '' }
    entry.text += (entry.text === '' ? '' : ' ') + item.str
    rows.set(key, entry)
  }
  const sorted = [...rows.values()].sort((a, b) => b.y - a.y)
  return sorted.map((row) => row.text.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

interface PageWithText {
  getTextContent(): Promise<{ items: { str: string; transform?: number[] }[] }>
}

interface PdfLike {
  numPages: number
  getPage(n: number): Promise<PageWithText>
  destroy(): Promise<void>
}

async function extractPdfText(filePath: string): Promise<string[]> {
  const pdfjs = await loadPdfJs()
  const data: Uint8Array = new Uint8Array(await readFile(filePath))

  let document: PdfLike | null = null
  try {
    document = (await pdfjs.getDocument({ data }).promise) as unknown as PdfLike
    const lines: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      lines.push(...groupIntoLines(content.items))
    }
    return lines
  } finally {
    if (document !== null) {
      try {
        await document.destroy()
      } catch {
        // best-effort cleanup
      }
    }
  }
}

async function ocrImageText(filePath: string): Promise<string> {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null
  try {
    const langPath = resolveOcrLangPath()
    worker = await createWorker('eng', undefined, langPath ? { langPath, gzip: true } : {})
    const { data } = await worker.recognize(filePath)
    return data.text ?? ''
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err)
    if (/network|fetch|download/i.test(hint)) {
      throw new AppError(
        'OCR_DATA_UNAVAILABLE',
        'OCR language data could not be downloaded (network required on first use). Connect to the internet and try again.',
      )
    }
    logger.error('ocr failed', { hint })
    throw new AppError('OCR_FAILED', 'The image could not be read with OCR.')
  } finally {
    if (worker) {
      try {
        await worker.terminate()
      } catch {
        // best-effort cleanup
      }
    }
  }
}

/** Reads a document: embedded PDF text, or OCR for images. Never writes data. */
export async function readDocument(filePath: string): Promise<ReadDocumentResult> {
  const kind = classifyFile(filePath)

  const fileStat = fs.statSync(filePath)
  if (fileStat.size > MAX_OCR_FILE_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 'The document is too large to read (50 MB maximum).')
  }

  const lines = kind === 'pdf' ? await extractPdfText(filePath) : []
  let method: ReadDocumentResult['method'] = 'text'
  let text = lines.join('\n')

  if (kind === 'image' || (kind === 'pdf' && text.trim() === '')) {
    method = 'ocr'
    if (kind === 'pdf') {
      logger.info('PDF contains no extractable text; falling back to OCR')
    }
    const result = await ocrImageText(filePath)
    text = result
    const fullLines = text.split(/\r?\n/)
    return {
      fileName: path.basename(filePath),
      filePath,
      kind,
      method,
      text,
      lines: fullLines.map((l) => l.trim()).filter(Boolean),
    }
  }

  return {
    fileName: path.basename(filePath),
    filePath,
    kind,
    method,
    text,
    lines,
  }
}

/**
 * Heuristic parsing of plain text into candidate transaction rows. The user
 * always reviews and adjusts these before anything is saved.
 */
export function parseDocumentLines(
  raw: string,
  _sourceFile: string,
): ParsedDocumentLine[] {
  const categoryWords = /^(total|subtotal|sub-total|balance|change|vat|tax|amount due|grand total)\b/i
  const datePattern = /\b(\d{4}-\d{1,2}-\d{1,2})\b|\b((?:\d{1,2})[-\/](?:\d{1,2})[-\/]\d{2,4})\b/g
  const amountPattern = /(?:^|\s)(?:\$|€|£|₱|PHP\s?)?[\(]?[\d,]+(?:\.\d{1,2})?[\)]?\s*(?:PHP)?(?=$|\s)/g

  const candidates: ParsedDocumentLine[] = []
  let order = 0

  const sourceText = typeof raw === 'string' ? raw : ''

  for (const sourceLine of sourceText.split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (line === '' || categoryWords.test(line)) {
      continue
    }
    if (!/\d/.test(line)) {
      continue
    }

    const dateMatches = [...line.matchAll(datePattern)]
    let date = dateMatches.length > 0 ? dateMatches[0][0] : null
    // Drop YYYY-MM-DD matches that are not real calendar dates (2026-02-31);
    // other formats are kept for the user to review.
    if (date !== null && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isValidDateString(date)) {
      date = null
    }

    const amountMatches = [...line.matchAll(amountPattern)].map((m) => m[0])
    let amount: number | null = null
    const lastAmount = amountMatches.length > 0 ? amountMatches[amountMatches.length - 1] : null
    if (lastAmount) {
      const cleaned = lastAmount
        .replace(/^\(/, '-')
        .replace(/\)$/, '')
        .replace(/[^0-9.-]/g, '')
      const parsed = Number(cleaned)
      if (Number.isFinite(parsed) && Math.abs(parsed) <= MAX_AMOUNT) {
        amount = Math.abs(parsed)
      }
    }

    let description = line
    if (dateMatches.length > 0) {
      description = description.replace(dateMatches[0][0], '')
    }
    if (lastAmount) {
      description = description.replace(lastAmount, '')
    }
    description = description.replace(/[|,;]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!description) {
      description = '(no description)'
    }

    candidates.push({
      order,
      date,
      description: description.slice(0, 255),
      amount,
      type: 'expense',
      category: '',
    })
    order += 1
  }

  return candidates
}