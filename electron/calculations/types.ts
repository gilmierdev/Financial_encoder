/**
 * Domain types for the financial calculation engine.
 *
 * The engine is pure: it never touches the database or Electron. Renderer
 * pages must never re-implement these formulas; they consume the results the
 * engine produces (via IPC).
 */

export type CalculationType =
  | 'income'
  | 'expense'
  | 'capital'
  | 'withdrawal'
  | 'asset'
  | 'liability'

export const CALCULATION_TYPES: readonly CalculationType[] = [
  'income',
  'expense',
  'capital',
  'withdrawal',
  'asset',
  'liability',
] as const

/** Minimal transaction shape the engine operates on. */
export interface CalcTransaction {
  id: number
  /** Canonical YYYY-MM-DD date. Compared lexicographically. */
  date: string
  type: CalculationType
  /** Non-negative amount in currency units. */
  amount: number
  category_id: number | null
  category_name?: string
}

/** Input filter used by every calculation. All bounds are inclusive. */
export interface CalculationFilter {
  date_from?: string
  date_to?: string
  types?: CalculationType[]
  category_ids?: number[]
}

/** Aggregate sums for a set of transactions. */
export interface CalculationTotals {
  income: number
  expense: number
  capital: number
  withdrawal: number
  asset: number
  liability: number
  /**
   * Money position: income + capital - expense - withdrawal.
   * Balance-sheet items (asset/liability) do not affect net.
   */
  net: number
  count: number
}

/** Bounds used when filling empty months in a monthly summary. */
export interface MonthlySummaryOptions {
  from?: string
  to?: string
}

/** Sums for a single calendar month. */
export interface MonthlySummary {
  /** YYYY-MM */
  month: string
  income: number
  expense: number
  capital: number
  withdrawal: number
  net: number
  count: number
}

/** Bucket size used by the cash-flow time series. */
export type CashFlowGranularity = 'day' | 'week' | 'month'

/** A single zero-filled bucket in a cash-flow time series. */
export interface CashFlowPoint {
  /**
   * Stable bucket key. `YYYY-MM-DD` for day/week buckets (week = Monday start)
   * and `YYYY-MM` for month buckets.
   */
  key: string
  /** Inclusive start date of the bucket, canonical `YYYY-MM-DD`. */
  date: string
  income: number
  expense: number
  capital: number
  withdrawal: number
  /** income + capital - expense - withdrawal. */
  net: number
  count: number
}

/** Options for the cash-flow time series. Bounds are inclusive. */
export interface CashFlowSeriesOptions {
  from?: string
  to?: string
  granularity?: CashFlowGranularity
}

/** Aggregated totals per category. */
export interface CategoryBreakdown {
  category_id: number
  category_name: string
  type: CalculationType
  total: number
  count: number
}