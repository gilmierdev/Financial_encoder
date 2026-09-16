const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * Formats a date using YYYY/MM/DD style tokens.
 * Supported tokens: YYYY, MM, MMM, MMMM, DD, D
 */
export function formatDate(date: Date, format: string): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  const tokens: Record<string, string> = {
    YYYY: String(year),
    MM: pad(month),
    MMM: date.toLocaleString(undefined, { month: 'short' }),
    MMMM: date.toLocaleString(undefined, { month: 'long' }),
    DD: pad(day),
    D: String(day),
  }

  return format.replace(/YYYY|MMMM|MMM|MM|DD|D/g, (token) => tokens[token] ?? token)
}

/** Returns today's date formatted according to the configured format. */
export function todayFormatted(format: string): string {
  return formatDate(new Date(), format)
}

/** Parses a YYYY-MM-DD string (the canonical DB format) into a Date at local noon. */
export function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12)
}

/** Converts a Date into the canonical YYYY-MM-DD database string. */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}