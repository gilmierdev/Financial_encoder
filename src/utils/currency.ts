const FALLBACK_SYMBOLS: Record<string, string> = {
  PHP: '₱',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
}

/** Symbol for a currency code, defaulting to the code itself when unknown. */
export function currencySymbol(code: string): string {
  return FALLBACK_SYMBOLS[code.toUpperCase()] ?? code.toUpperCase()
}

/** Coerces a possibly invalid value into a finite number (defaults to 0). */
export function toFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/**
 * Formats a peso-style amount using the locale's currency rules.
 * Falls back to a safe symbol+number rendering if the Intl currency formatter
 * does not recognise the code.
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  const code = currencyCode.toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(toFiniteNumber(amount))
  } catch {
    const symbol = currencySymbol(code)
    const sign = toFiniteNumber(amount) < 0 ? '-' : ''
    return `${sign}${symbol}${Math.abs(toFiniteNumber(amount)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
}

/**
 * Formats a value for chart axes. Sub-million values keep their thousands
 * separators (₱0, ₱1,000, ₱100,000); larger values compact to ₱1.2M.
 */
export function formatCompactCurrency(amount: number, currencyCode: string): string {
  const code = currencyCode.toUpperCase()
  const safe = toFiniteNumber(amount)
  const useCompact = Math.abs(safe) >= 1_000_000
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      ...(useCompact ? { notation: 'compact', compactDisplay: 'short' } : {}),
      maximumFractionDigits: useCompact ? 1 : 0,
      minimumFractionDigits: 0,
    }).format(safe)
  } catch {
    const symbol = currencySymbol(code)
    const sign = safe < 0 ? '-' : ''
    const abs = Math.abs(safe)
    if (abs >= 1_000_000) {
      return `${sign}${symbol}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
    }
    return `${sign}${symbol}${Math.round(abs).toLocaleString()}`
  }
}