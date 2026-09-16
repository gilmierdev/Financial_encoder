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
    }).format(amount)
  } catch {
    const symbol = currencySymbol(code)
    return `${symbol}${Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
}