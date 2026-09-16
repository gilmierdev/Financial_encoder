/**
 * Shared main-process input validation helpers used across the IPC/service
 * layer. Everything the renderer sends is validated here in the main process.
 */

/** Upper bound for a single transaction / imported / OCR-parsed amount. */
export const MAX_AMOUNT = 999_999_999_999

/** Upper bound for imported spreadsheet / OCR document file sizes (bytes). */
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024
export const MAX_OCR_FILE_BYTES = 50 * 1024 * 1024

/**
 * Accepts only calendar-valid YYYY-MM-DD dates within a sane year range.
 * Rejects out-of-range months/days such as 2026-13-01 or 2026-02-31.
 */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return false
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false
  }
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

/** Accepts only positive safe integers (SQLite row ids from the renderer). */
export function isSafePositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isSafeInteger(value) && value > 0
}

/** Accepts only finite, non-negative amounts with a sane upper bound. */
export function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT
}

/** Max length for free-text filter fields such as search_term. */
export const MAX_SEARCH_TERM_LENGTH = 200