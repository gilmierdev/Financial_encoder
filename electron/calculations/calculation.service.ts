import { getDb } from '../database/connection'
import { cashFlowSeries, categoryBreakdown, monthlySummary, totals } from './engine'
import type {
  CalcTransaction,
  CalculationFilter,
  CalculationTotals,
  CashFlowGranularity,
  CashFlowPoint,
  CashFlowSeriesOptions,
  CategoryBreakdown,
  MonthlySummary,
  MonthlySummaryOptions,
} from './types'

/**
 * Database-backed facade over the pure calculation engine.
 *
 * SQL is only used to *select* rows (never to compute), so every financial
 * formula lives in one place: the engine. This service prunes rows with the
 * filter, maps them to the engine's minimal shape and delegates all math.
 */

interface RawTransactionRow {
  id: number
  date: string
  type: CalcTransaction['type']
  amount: number
  category_id: number | null
  category_name: string | null
}

function loadTransactions(filter: CalculationFilter): CalcTransaction[] {
  const db = getDb()

  const where: string[] = []
  const params: (string | number)[] = []

  if (filter.types?.length) {
    const types = filter.types.filter(
      (t): t is CalcTransaction['type'] => typeof t === 'string' && t.length > 0,
    )
    if (types.length > 0) {
      where.push(`t.type IN (${types.map(() => '?').join(', ')})`)
      params.push(...types)
    }
  }

  if (filter.category_ids?.length) {
    const ids = filter.category_ids.filter((id) => Number.isInteger(id) && id > 0)
    if (ids.length > 0) {
      where.push(`t.category_id IN (${ids.map(() => '?').join(', ')})`)
      params.push(...ids)
    }
  }

  if (filter.date_from) {
    where.push('t.date >= ?')
    params.push(filter.date_from)
  }
  if (filter.date_to) {
    where.push('t.date <= ?')
    params.push(filter.date_to)
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  const rows = db.prepare(`
    SELECT t.id, t.date, t.type, t.amount, t.category_id, c.name AS category_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    ${whereClause}
  `).all(...params) as RawTransactionRow[]

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    type: row.type,
    amount: row.amount,
    category_id: row.category_id,
    category_name: row.category_name ?? undefined,
  }))
}

export function calculateTotals(filter: CalculationFilter = {}): CalculationTotals {
  return totals(loadTransactions(filter))
}

export function calculateMonthlySummaries(filter: CalculationFilter = {}): MonthlySummary[] {
  const options: MonthlySummaryOptions = {
    from: filter.date_from,
    to: filter.date_to,
  }
  return monthlySummary(loadTransactions(filter), options)
}

export function calculateCashFlowSeries(
  filter: CalculationFilter = {},
  granularity: CashFlowGranularity = 'month',
): CashFlowPoint[] {
  const options: CashFlowSeriesOptions = {
    from: filter.date_from,
    to: filter.date_to,
    granularity,
  }
  return cashFlowSeries(loadTransactions(filter), options)
}

export function calculateCategoryBreakdown(filter: CalculationFilter = {}): CategoryBreakdown[] {
  return categoryBreakdown(loadTransactions(filter))
}