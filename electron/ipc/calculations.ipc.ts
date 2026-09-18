import { AppError, registerIpcHandler } from '../services/ipc-handler'
import {
  calculateCashFlowSeries,
  calculateCategoryBreakdown,
  calculateMonthlySummaries,
  calculateTotals,
} from '../calculations/calculation.service'
import type { CalculationFilter, CashFlowGranularity } from '../calculations/types'
import type {
  CalculationTotals,
  CashFlowPoint,
  CategoryBreakdown,
  MonthlySummary,
} from '../calculations/types'

const GRANULARITIES = new Set<CashFlowGranularity>(['day', 'week', 'month'])

function validateGranularity(raw: unknown): CashFlowGranularity {
  if (raw === undefined || raw === null) {
    return 'month'
  }
  if (typeof raw !== 'string' || !GRANULARITIES.has(raw as CashFlowGranularity)) {
    throw new AppError('VALIDATION_ERROR', 'granularity must be one of: day, week, month.')
  }
  return raw as CashFlowGranularity
}

const VALID_TYPES = new Set<string>([
  'income',
  'expense',
  'capital',
  'withdrawal',
  'asset',
  'liability',
])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validates and coerces the first invoke argument into a CalculationFilter.
 * IPC input from the renderer is always validated in the main process.
 */
function validateFilter(raw: unknown): CalculationFilter {
  if (raw === undefined || raw === null) {
    return {}
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid calculation filter.')
  }

  const input = raw as Record<string, unknown>
  const filter: CalculationFilter = {}

  if (input.date_from !== undefined) {
    if (typeof input.date_from !== 'string' || !DATE_RE.test(input.date_from)) {
      throw new AppError('VALIDATION_ERROR', 'A valid date_from (YYYY-MM-DD) is required.')
    }
    filter.date_from = input.date_from
  }
  if (input.date_to !== undefined) {
    if (typeof input.date_to !== 'string' || !DATE_RE.test(input.date_to)) {
      throw new AppError('VALIDATION_ERROR', 'A valid date_to (YYYY-MM-DD) is required.')
    }
    filter.date_to = input.date_to
  }
  if (filter.date_from && filter.date_to && filter.date_from > filter.date_to) {
    throw new AppError('VALIDATION_ERROR', 'date_from must not be after date_to.')
  }

  if (input.types !== undefined) {
    if (!Array.isArray(input.types) || input.types.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'types must be a non-empty array of transaction types.')
    }
    for (const value of input.types) {
      if (typeof value !== 'string' || !VALID_TYPES.has(value)) {
        throw new AppError('VALIDATION_ERROR', `Invalid transaction type: ${String(value)}.`)
      }
    }
    filter.types = input.types as CalculationFilter['types']
  }

  if (input.category_ids !== undefined) {
    if (!Array.isArray(input.category_ids) || input.category_ids.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'category_ids must be a non-empty array of positive integers.')
    }
    for (const value of input.category_ids) {
      if (!Number.isInteger(value) || (value as number) <= 0) {
        throw new AppError('VALIDATION_ERROR', `Invalid category id: ${String(value)}.`)
      }
    }
    filter.category_ids = input.category_ids as number[]
  }

  return filter
}

export function registerCalculationIpcHandlers(): void {
  registerIpcHandler<CalculationTotals>('calculations:totals', (_event, ...args: unknown[]) =>
    calculateTotals(validateFilter(args[0])),
  )

  registerIpcHandler<MonthlySummary[]>('calculations:monthly', (_event, ...args: unknown[]) =>
    calculateMonthlySummaries(validateFilter(args[0])),
  )

  registerIpcHandler<CashFlowPoint[]>('calculations:cash-flow', (_event, ...args: unknown[]) =>
    calculateCashFlowSeries(validateFilter(args[0]), validateGranularity(args[1])),
  )

  registerIpcHandler<CategoryBreakdown[]>('calculations:by-category', (_event, ...args: unknown[]) =>
    calculateCategoryBreakdown(validateFilter(args[0])),
  )
}