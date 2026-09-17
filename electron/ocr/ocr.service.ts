import * as path from 'path'
import * as fs from 'fs'
import { readFile } from 'fs/promises'
import { createWorker } from 'tesseract.js'
import { app } from 'electron'
import { AppError } from '../services/ipc-handler'
import { logger } from '../services/logger.service'
import { MAX_AMOUNT, MAX_OCR_FILE_BYTES } from '../services/validation'
import { runPaddleOcr } from './paddle.service'

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

async function ocrImageTextTesseract(filePath: string): Promise<string> {
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

/**
 * Reads text from an image or scanned PDF. PaddleOCR is preferred for accuracy;
 * tesseract.js is used as a fallback so the scanner keeps working when the
 * Python runtime is unavailable.
 */
async function ocrImageText(filePath: string): Promise<string> {
  try {
    const result = await runPaddleOcr(filePath)
    if (result.text.trim() !== '') {
      logger.info('document read with paddleocr', { pages: result.pages, score: result.averageScore })
      return result.text
    }
    logger.info('paddleocr returned no text; falling back to tesseract')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.info('paddleocr unavailable; falling back to tesseract', { message })
  }
  return ocrImageTextTesseract(filePath)
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

/* ----------------------------- Parsing ------------------------------ */

type DocumentFlavor = 'itemized' | 'bill' | 'gcash'

const pad2 = (n: number): string => String(n).padStart(2, '0')

const CATEGORY_WORD_PATTERN =
  /^(total|subtotal|sub-total|balance|change|vat|vatable|tax|grand total|amount due|total amount|tendered|amount tendered|cash received|total sales)\b/i

const META_LABEL_PATTERN =
  /\b(reference (no\.?|number)|ref\.?\s*(no\.?)?|transaction (id|no\.?|number|ref)|invoice (no\.?|number|#)|receipt (no\.?|number|#)|account (no\.?|number|#)|check (no\.?|number)|serial (no\.?|number)|control (no\.?|number)|voucher (no\.?|number)|ticket (no\.?|number)|payment (ref\.?|no\.?|number|id)|service ref|customer (no\.?|number)|member (no\.?|number))\b/i

const PHONE_PATTERN = /\b(0\d{2}[- ]?\d{3}[- ]?\d{4}|09\d{9})\b/

const CURRENCY_MARKER_PATTERN = /\b(php|peso|₱|\$|€|£)\b/i

const AMOUNT_TOKEN_RE = new RegExp(
  [
    '(?<![A-Za-z0-9])',
    '(?:PHP|PESO|P(?=\\d)|USD|EUR|EURO|GBP|JPY|₱|\\$|€|£)?\\s*',
    '\\(?',
    '(\\d{1,3}(?:,\\d{3})+|\\d{1,12})(?:\\.\\d{1,2})?',
    '\\)?',
    '(?:\\s*(?:PHP|PESO|₱))?',
    '(?![A-Za-z0-9])',
  ].join(''),
  'gi',
)

const DATE_TOKEN_RE = new RegExp(
  [
    '\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}', // 2026-09-17 / 2026.09.17
    '\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}', // 09/17/2026 / 17/09/2026
    '[A-Za-z]{3,9}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*,?\\s+\\d{2,4}', // Sep 17, 2026
    '\\d{1,2}(?:st|nd|rd|th)?\\s+[A-Za-z]{3,9}\\.?\\s+\\d{2,4}', // 17 Sep 2026
    '\\d{1,2}[-/.][A-Za-z]{3,9}[-/.]\\d{2,4}', // 17-Sep-2026
    '\\d{4}[-/.][A-Za-z]{3,9}[-/.]\\d{1,2}', // 2026-Sep-17
  ].join('|'),
  'gi',
)

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/** Build a strict calendar date as YYYY-MM-DD, or null when invalid (2026-02-31). */
function buildIso(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null
  const probe = new Date(Date.UTC(year, month - 1, day, 12))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function fixYear(year: number): number {
  if (year < 100) return year + (year < 50 ? 2000 : 1900)
  return year
}

/** Normalize one date token to YYYY-MM-DD, or null when not a real calendar date. */
function parseDateToken(raw: string): string | null {
  const s = raw.replace(/\s+/g, ' ').trim().replace(/^(\d{1,2})(st|nd|rd|th)\b/i, '$1')
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return buildIso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    const month = a > 12 ? b : a
    const day = a > 12 ? a : b
    return buildIso(fixYear(+m[3]), month, day)
  }
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/)
  if (m) {
    const mo = MONTH_INDEX[m[1].slice(0, 3).toLowerCase()]
    return mo === undefined ? null : buildIso(fixYear(+m[3]), mo + 1, +m[2])
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})$/)
  if (m) {
    const mo = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()]
    return mo === undefined ? null : buildIso(fixYear(+m[3]), mo + 1, +m[1])
  }
  m = s.match(/^(\d{1,2})[-/.]([A-Za-z]{3,9})[-/.](\d{2,4})$/)
  if (m) {
    const mo = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()]
    return mo === undefined ? null : buildIso(fixYear(+m[3]), mo + 1, +m[1])
  }
  m = s.match(/^(\d{4})[-/.]([A-Za-z]{3,9})[-/.](\d{1,2})$/)
  if (!m) return null
  const mo = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()]
  return mo === undefined ? null : buildIso(+m[1], mo + 1, +m[3])
}

/** All date-like tokens in a line; iso is null when the raw token is not a real date. */
function collectDateTokens(line: string): { iso: string | null; raw: string }[] {
  const out: { iso: string | null; raw: string }[] = []
  const seen = new Set<string>()
  for (const m of line.matchAll(DATE_TOKEN_RE)) {
    const raw = m[0]
    if (seen.has(raw)) continue
    seen.add(raw)
    out.push({ iso: parseDateToken(raw), raw })
  }
  return out
}

/** Amount validation that rejects years, reference/phone digits and over-budget values. */
function validateAmountToken(raw: string): number | null {
  const text = raw.replace(/\s/g, '')
  const numberText = text.replace(/[^0-9.-]/g, '')
  const value = Number(numberText.replace(/^\./, '0.'))
  if (!Number.isFinite(value) || value < 0) return null
  const digits = text.replace(/[^0-9]/g, '')
  const hasDecimal = /\.\d/.test(text)
  if (!hasDecimal) {
    if (digits.length === 4 && value >= 1800 && value <= 2100) return null // year
    if (digits.length >= 8) return null // ref number / phone / subscription id
    if (digits.length < 3 && !text.includes(',') && !/^(php|peso|p|₱|\$|€|£)/i.test(text)) {
      return null // bare 1-2 digit values are usually times or quantities
    }
  }
  if (value > MAX_AMOUNT) return null
  return value
}

function amountCandidates(line: string): { value: number; text: string }[] {
  const out: { value: number; text: string }[] = []
  for (const m of line.matchAll(AMOUNT_TOKEN_RE)) {
    const value = validateAmountToken(m[0])
    if (value !== null) out.push({ value, text: m[0] })
  }
  return out
}

function detectFlavor(text: string): DocumentFlavor {
  if (/(gcash|g.?xchange|\bgbills\b|gx[0-9]{6,})/i.test(text)) return 'gcash'
  if (
    /(amount due|billing statement|statement of account|due date|account (number|no\.?)|electric|electricity|water (bill|statement)|meralco|manila electric|manila water|maynilad|pldt|globe|smart|converge|official receipt|utility)/i.test(
      text,
    )
  ) {
    return 'bill'
  }
  return 'itemized'
}

/** Last amount on the first line matching a label, skipping exclusion labels. */
function labelledAmount(lines: string[], labelRe: RegExp, excludeRe: RegExp | null): number | null {
  for (const line of lines) {
    if (excludeRe && excludeRe.test(line)) continue
    if (!labelRe.test(line)) continue
    const candidates = amountCandidates(line)
    if (candidates.length > 0) return candidates[candidates.length - 1].value
  }
  return null
}

/** Amount to record for a billing/statement document ("amount due" beats generic "total"). */
function billAmount(lines: string[]): number | null {
  const groups: RegExp[] = [
    /total\s+amount\s+due/i,
    /amount\s+due/i,
    /payment\s+due/i,
    /grand\s+total/i,
    /\bcurrent\s+charges\b/i,
    /\btotal\b/i,
    /\bamount\b/i,
  ]
  for (const group of groups) {
    const value = labelledAmount(lines, group, /(previous|past|unpaid|outstanding|advance|deposit)/i)
    if (value !== null) return value
  }
  return null
}

/** Amount to record for a GCash receipt ("total" beats "amount"; falls back to largest). */
function gcashAmount(lines: string[]): number | null {
  const totals = labelledAmount(lines, /\btotal\b/i, /(balance|change|fee)/i)
  if (totals !== null) return totals
  const amounts = labelledAmount(lines, /\bamount\b/i, /(fee|balance|change|reference|date|deduction)/i)
  if (amounts !== null) return amounts
  let best: number | null = null
  for (const line of lines) {
    if (/(fee|balance|change|reference|deduction)/i.test(line)) continue
    const candidates = amountCandidates(line)
    if (candidates.length === 0) continue
    const last = candidates[candidates.length - 1].value
    if (best === null || last > best) best = last
  }
  return best
}

/** Best date across the document: label-prioritized (Due Date vs period vs generic). */
function findBestDate(lines: string[], flavor: DocumentFlavor): string | null {
  let bestDate: string | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const line of lines) {
    const dates = collectDateTokens(line)
    if (dates.length === 0) continue
    const lower = line.toLowerCase()
    let score = 0
    let chosen = dates[0]
    if (flavor === 'bill') {
      if (/(due date|payment date)/.test(lower)) {
        score = 100
      } else if (/(^bill date|^invoice date)|bill date|invoice date/.test(lower)) {
        score = 90
      } else if (/(statement period|billing period|period)/.test(lower)) {
        score = 85
        chosen = dates[dates.length - 1]
      } else if (/(^|\s)date/.test(lower)) {
        score = 60
      } else {
        score = 30
      }
    } else {
      score = /(transaction date|posted|(^|\s)date)/i.test(lower) ? 100 : 40
    }
    if (score > bestScore) {
      bestScore = score
      bestDate = chosen.iso
    }
  }
  return bestDate
}

const GCASH_TYPE_LABELS: [RegExp, string][] = [
  [/\bgbills\b|paid via gcash|bill amount|pay bills|bill payment/i, 'Bill Payment'],
  [/send money/i, 'Send Money'],
  [/cash in/i, 'Cash In'],
  [/cash out/i, 'Cash Out'],
  [/bank transfer/i, 'Bank Transfer'],
  [/receive money|received money/i, 'Receive Money'],
  [/buy load/i, 'Buy Load'],
  [/borrow|loan/i, 'Loan'],
  [/invest/i, 'Investment'],
]

function findGCashType(lines: string[]): string {
  for (const line of lines) {
    for (const [re, label] of GCASH_TYPE_LABELS) if (re.test(line)) return label
  }
  return 'Transaction'
}

function findCounterparty(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const m = line.match(/(?:sent to|received from|paid to|to|from)\s*:?\s+(.+)/i)
    if (m && /[A-Za-z]/.test(m[1])) {
      const name = m[1].trim().replace(/[|;]+$/, '').trim()
      if (name.length >= 2 && name.length <= 60 && !/gcash/i.test(name)) return name
    }
    if (/^(sent to|received from|paid to)$/i.test(line) && i + 1 < lines.length) {
      const next = lines[i + 1].trim()
      if (/^[A-Z][A-Za-z .'-]{2,50}$/.test(next) && !/gcash/i.test(next)) return next
    }
  }
  return null
}

const BILL_BRANDS: [RegExp, string][] = [
  [/\bmeralco\b|\bmanila electric\b/i, 'MERALCO'],
  [/\bmanila water\b|\bmaynilad\b/i, 'Manila Water'],
  [/\bwater district\b/i, 'Water District'],
  [/\bpldt\b/i, 'PLDT'],
  [/\bglobe tele\b|\bcn-?dito\b|\bconverge\b/i, 'Telco'],
  [/\bsss\b|social security system/i, 'SSS'],
  [/\bpag-?ibig\b|hdmf/i, 'Pag-IBIG'],
  [/\bbir\b|bureau of internal revenue/i, 'BIR'],
  [/\bnbi\b/i, 'NBI'],
  [/\bdfa\b/i, 'DFA'],
  [/\bmaya\b|\bpaymaya\b/i, 'Maya'],
]

function findBillBrand(lines: string[]): string | null {
  for (const line of lines) {
    for (const [re, label] of BILL_BRANDS) if (re.test(line)) return label
  }
  return null
}

/** First all-caps non-metadata line (typical payee/company name). */
function firstPayeeLine(lines: string[]): string | null {
  for (const line of lines) {
    const t = line.trim()
    if (t.length < 3 || t.length > 40 || !/^[A-Z][A-Z0-9 &'.(),-]+$/.test(t)) continue
    if (/^(amount|total|date|reference|account|payment|summary|statement|bill|invoice|due|period|payable|gbills|gcash|receive|email)/i.test(t)) continue
    return t
  }
  return null
}

function buildStructuredDescription(lines: string[], flavor: DocumentFlavor): string {
  if (flavor === 'gcash') {
    const type = findGCashType(lines)
    const party = findBillBrand(lines) ?? findCounterparty(lines)
    const suffix = party ? `: ${party}` : ''
    return `GCash ${type}${suffix}`
  }
  const brand = findBillBrand(lines)
  if (brand) return `${brand} bill`
  const payee = firstPayeeLine(lines)
  if (payee) return `${payee} bill`
  return 'Bill payment'
}

function parseItemizedRows(lines: string[]): ParsedDocumentLine[] {
  const rows: ParsedDocumentLine[] = []
  let order = 0
  for (const line of lines) {
    if (line === '' || !/\d/.test(line)) continue
    if (CATEGORY_WORD_PATTERN.test(line)) continue
    if (PHONE_PATTERN.test(line) && !CURRENCY_MARKER_PATTERN.test(line)) continue

    const dateTokens = collectDateTokens(line)
    let working = line
    for (const d of dateTokens) working = working.replace(d.raw, ' ')

    const rawAmounts = [...working.matchAll(AMOUNT_TOKEN_RE)].map((m) => m[0])
    const amounts = amountCandidates(working)
    let lastAmount: number | null = null
    for (const a of amounts) lastAmount = a.value

    // Date/header-only lines are not transactions.
    if (lastAmount === null && dateTokens.some((d) => d.iso !== null)) continue
    // Reference / account / phone style lines without a real amount.
    if (lastAmount === null && META_LABEL_PATTERN.test(line)) continue

    let description = working
    for (const text of rawAmounts) description = description.replace(text, ' ')
    for (const d of dateTokens) description = description.replace(d.raw, ' ')
    description = description
      .replace(/[|,;:]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s-.:,;]+|[\s-.:,;]+$/g, '')
      .trim()
    if (!description) description = '(no description)'

    rows.push({
      order,
      date: dateTokens.find((d) => d.iso !== null)?.iso ?? null,
      description: description.slice(0, 255),
      amount: lastAmount,
      type: 'expense',
      category: '',
    })
    order += 1
  }
  return rows
}

/**
 * Heuristic parsing of plain text into candidate transaction rows. GCash
 * receipts and billing statements collapse into a single structured row;
 * store receipts stay as itemized lines. The user always reviews and adjusts
 * these before anything is saved.
 */
export function parseDocumentLines(
  raw: string,
  _sourceFile: string,
): ParsedDocumentLine[] {
  const sourceText = typeof raw === 'string' ? raw : ''
  const lines = sourceText
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const flavor = detectFlavor(lines.join(' '))

  if (flavor === 'gcash' || flavor === 'bill') {
    const amount = flavor === 'gcash' ? gcashAmount(lines) : billAmount(lines)
    if (amount !== null) {
      return [
        {
          order: 0,
          date: findBestDate(lines, flavor),
          description: buildStructuredDescription(lines, flavor).slice(0, 255),
          amount,
          type: 'expense',
          category: '',
        },
      ]
    }
  }

  return parseItemizedRows(lines)
}