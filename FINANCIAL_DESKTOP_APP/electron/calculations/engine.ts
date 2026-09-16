import type {
  CalcTransaction,
  CalculationFilter,
  CalculationTotals,
  CalculationType,
  CategoryBreakdown,
  MonthlySummary,
  MonthlySummaryOptions,
} from './types'

/**
 * Pure financial calculation engine.
 *
 * This module contains every formula in the application. It has no database or
 * Electron dependency and is unit tested in isolation.
 *
 * Amounts arrive as floats (the schema stores REAL). To avoid floating-point
 * drift, all accumulation happens in integer cents and is converted back to
 * currency units exactly once, at the end.
 */

const CENT = 100

/** Converts a currency-unit amount into integer cents (rounded). */
function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * CENT)
}

/** Converts an integer-cents accumulator back into currency units. */
function fromCents(cents: number): number {
  return cents / CENT
}

/** Returns the YYYY-MM key for a YYYY-MM-DD date. */
function monthKey(date: string): string {
  return date.slice(0, 7)
}

/** Adds a number of months to a YYYY-MM key. */
function addMonths(key: string, delta: number): string {
  const [year, month] = key.split('-').map((part) => Number(part))
  const total = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`
}

/** Returns whether a transaction satisfies a filter (bounds inclusive). */
export function matchesFilter(tx: CalcTransaction, filter: CalculationFilter): boolean {
  if (filter.date_from && tx.date < filter.date_from) {
    return false
  }
  if (filter.date_to && tx.date > filter.date_to) {
    return false
  }
  if (filter.types && filter.types.length > 0 && !filter.types.includes(tx.type)) {
    return false
  }
  if (
    filter.category_ids &&
    filter.category_ids.length > 0 &&
    (tx.category_id == null || !filter.category_ids.includes(tx.category_id))
  ) {
    return false
  }
  return true
}

/** Filters a list of transactions in place (returns a new array). */
export function applyFilter(
  transactions: CalcTransaction[],
  filter: CalculationFilter,
): CalcTransaction[] {
  return transactions.filter((tx) => matchesFilter(tx, filter))
}

/** Total amount for a single transaction type, in currency units. */
export function sumByType(transactions: CalcTransaction[], type: CalculationType): number {
  let cents = 0
  for (const tx of transactions) {
    if (tx.type === type) {
      cents += toCents(tx.amount)
    }
  }
  return fromCents(cents)
}

/** Aggregate totals for a set of transactions. */
export function totals(transactions: CalcTransaction[]): CalculationTotals {
  const sums: Record<CalculationType, { cents: number }> = {
    income: { cents: 0 },
    expense: { cents: 0 },
    capital: { cents: 0 },
    withdrawal: { cents: 0 },
    asset: { cents: 0 },
    liability: { cents: 0 },
  }

  for (const tx of transactions) {
    sums[tx.type].cents += toCents(tx.amount)
  }

  const income = fromCents(sums.income.cents)
  const expense = fromCents(sums.expense.cents)
  const capital = fromCents(sums.capital.cents)
  const withdrawal = fromCents(sums.withdrawal.cents)

  return {
    income,
    expense,
    capital,
    withdrawal,
    asset: fromCents(sums.asset.cents),
    liability: fromCents(sums.liability.cents),
    net: income + capital - expense - withdrawal,
    count: transactions.length,
  }
}

function emptyMonthlySummary(month: string): MonthlySummary {
  return {
    month,
    income: 0,
    expense: 0,
    capital: 0,
    withdrawal: 0,
    net: 0,
    count: 0,
  }
}

/**
 * Sums transactions per calendar month, zero-filling every month between the
 * effective bounds so charts/period tables never have gaps.
 *
 * Effective bounds come from `options.from`/`options.to` when given; otherwise
 * they are derived from the transactions themselves. Data outside an explicit
 * bound is ignored so results always stay inside the requested window.
 */
export function monthlySummary(
  transactions: CalcTransaction[],
  options: MonthlySummaryOptions = {},
): MonthlySummary[] {
  let startKey = options.from ? monthKey(options.from) : null
  let endKey = options.to ? monthKey(options.to) : null

  for (const tx of transactions) {
    const key = monthKey(tx.date)
    if (startKey == null || key < startKey) {
      startKey = key
    }
    if (endKey == null || key > endKey) {
      endKey = key
    }
  }

  if (startKey == null) {
    return []
  }
  if (endKey == null) {
    endKey = startKey
  }

  const months = new Map<string, MonthlySummary>()
  for (let key = startKey; key <= endKey; key = addMonths(key, 1)) {
    months.set(key, emptyMonthlySummary(key))
  }

  const centsBuckets = new Map<string, Record<CalculationType, number>>()

  for (const tx of transactions) {
    const key = monthKey(tx.date)
    const summary = months.get(key)
    if (!summary) {
      continue
    }
    let bucket = centsBuckets.get(key)
    if (!bucket) {
      bucket = { income: 0, expense: 0, capital: 0, withdrawal: 0, asset: 0, liability: 0 }
      centsBuckets.set(key, bucket)
    }
    bucket[tx.type] += toCents(tx.amount)
    summary.count += 1
  }

  for (const [key, provided] of centsBuckets) {
    const summary = months.get(key)
    if (!summary) {
      continue
    }
    summary.income = fromCents(provided.income)
    summary.expense = fromCents(provided.expense)
    summary.capital = fromCents(provided.capital)
    summary.withdrawal = fromCents(provided.withdrawal)
    const netCents = provided.income + provided.capital - provided.expense - provided.withdrawal
    summary.net = fromCents(netCents)
  }

  return [...months.values()].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
}

/** Aggregates totals per category, ordered by type then descending amount. */
export function categoryBreakdown(transactions: CalcTransaction[]): CategoryBreakdown[] {
  const groups = new Map<number, { name: string; type: CalculationType; cents: number; count: number }>()

  for (const tx of transactions) {
    if (tx.category_id == null) {
      continue
    }
    let group = groups.get(tx.category_id)
    if (!group) {
      group = {
        name: tx.category_name ?? `Category ${tx.category_id}`,
        type: tx.type,
        cents: 0,
        count: 0,
      }
      groups.set(tx.category_id, group)
    }
    group.cents += toCents(tx.amount)
    group.count += 1
  }

  const result: CategoryBreakdown[] = [...groups.entries()].map(([category_id, group]) => ({
    category_id,
    category_name: group.name,
    type: group.type,
    total: fromCents(group.cents),
    count: group.count,
  }))

  result.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type < b.type ? -1 : 1
    }
    return b.total - a.total
  })

  return result
}