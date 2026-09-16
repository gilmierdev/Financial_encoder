export type PeriodKey = 'this-month' | 'last-3-months' | 'this-year' | 'all' | 'custom'

export interface PeriodRange {
  date_from?: string
  date_to?: string
}

export const PERIOD_KEYS: readonly PeriodKey[] = ['this-month', 'last-3-months', 'this-year', 'all']

export const PERIOD_LABELS: Partial<Record<PeriodKey, string>> = {
  'this-month': 'This Month',
  'last-3-months': 'Last 3 Months',
  'this-year': 'This Year',
  all: 'All Time',
}

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function startOfMonth(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

export function endOfMonth(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`
}

export function formatMonth(key: string): string {
  const [y, m] = key.split('-')
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${monthNames[Number(m) - 1]} ${y}`
}

export function periodRange(key: PeriodKey, customFrom: string, customTo: string): PeriodRange {
  const now = new Date()
  switch (key) {
    case 'this-month':
      return { date_from: startOfMonth(now), date_to: endOfMonth(now) }
    case 'last-3-months': {
      const from = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      return { date_from: startOfMonth(from), date_to: endOfMonth(now) }
    }
    case 'this-year':
      return { date_from: `${now.getFullYear()}-01-01`, date_to: `${now.getFullYear()}-12-31` }
    case 'all':
      return {}
    case 'custom':
      return {
        ...(customFrom ? { date_from: customFrom } : {}),
        ...(customTo ? { date_to: customTo } : {}),
      }
  }
}

/** True when a custom range has both bounds but From is later than To. */
export function customRangeInvalid(from: string, to: string): boolean {
  return from !== '' && to !== '' && from > to
}

/**
 * Resolves the window the cash-flow chart should cover. Explicit period bounds
 * win (so the chart always reflects the selection); otherwise falls back to the
 * last six months of activity.
 */
export function cashFlowWindow(date_to: string | undefined, date_from: string | undefined): PeriodRange {
  if (date_from && date_to) {
    return { date_from, date_to }
  }
  const end = date_to ? new Date(date_to + 'T12:00:00') : new Date()
  const start = new Date(end.getFullYear(), end.getMonth() - 5, 1)
  return { date_from: startOfMonth(start), date_to: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}` }
}