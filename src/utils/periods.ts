import type { CashFlowGranularity } from '../../electron/types/ipc'
import { toISODate } from './dates'

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

/**
 * Resolves a period selection into inclusive `YYYY-MM-DD` bounds.
 *
 * Rolling periods end at *today* (not at the end of the calendar month/year) so
 * a chart never zero-fills future days/months that have not happened yet.
 */
export function periodRange(key: PeriodKey, customFrom: string, customTo: string): PeriodRange {
  const now = new Date()
  switch (key) {
    case 'this-month':
      return { date_from: startOfMonth(now), date_to: toISODate(now) }
    case 'last-3-months': {
      const from = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      return { date_from: startOfMonth(from), date_to: toISODate(now) }
    }
    case 'this-year':
      return { date_from: `${now.getFullYear()}-01-01`, date_to: toISODate(now) }
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

/** Number of whole days between two `YYYY-MM-DD` strings (UTC based). */
export function dateSpanDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const start = Date.UTC(fy, (fm || 1) - 1, fd || 1)
  const end = Date.UTC(ty, (tm || 1) - 1, td || 1)
  return Math.round((end - start) / 86_400_000)
}

/**
 * Picks a sensible bucket size for the cash-flow chart:
 * short ranges stay daily, medium ranges roll up weekly, and long ranges
 * (a year or all time) aggregate monthly.
 */
export function cashFlowGranularity(range: PeriodRange): CashFlowGranularity {
  if (!range.date_from || !range.date_to) {
    return 'month'
  }
  const span = dateSpanDays(range.date_from, range.date_to)
  if (span <= 31) {
    return 'day'
  }
  if (span <= 120) {
    return 'week'
  }
  return 'month'
}
