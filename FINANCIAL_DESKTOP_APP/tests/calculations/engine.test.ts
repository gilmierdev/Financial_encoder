import { describe, expect, it } from 'vitest'
import {
  applyFilter,
  categoryBreakdown,
  matchesFilter,
  monthlySummary,
  sumByType,
  totals,
} from '../../electron/calculations/engine'
import type { CalcTransaction, CalculationFilter } from '../../electron/calculations/types'

let seq = 0

function makeTx(overrides: Partial<CalcTransaction> & Pick<CalcTransaction, 'date' | 'amount'>): CalcTransaction {
  seq += 1
  return {
    id: seq,
    type: 'income',
    category_id: null,
    ...overrides,
  }
}

function resetSeq() {
  seq = 0
}

describe('sumByType', () => {
  it('returns 0 for empty input', () => {
    expect(sumByType([], 'income')).toBe(0)
  })

  it('sums amounts for the requested type only', () => {
    const txs = [
      makeTx({ amount: 100, type: 'income' }),
      makeTx({ amount: 300, type: 'income' }),
      makeTx({ amount: 200, type: 'expense' }),
    ]
    expect(sumByType(txs, 'income')).toBe(400)
    expect(sumByType(txs, 'expense')).toBe(200)
  })

  it('ignores unrelated types', () => {
    const txs = [
      makeTx({ amount: 50, type: 'capital' }),
      makeTx({ amount: 25, type: 'withdrawal' }),
    ]
    expect(sumByType(txs, 'income')).toBe(0)
  })
})

describe('totals', () => {
  it('returns all zeros for empty input', () => {
    resetSeq()
    const result = totals([])
    expect(result).toEqual({
      income: 0,
      expense: 0,
      capital: 0,
      withdrawal: 0,
      asset: 0,
      liability: 0,
      net: 0,
      count: 0,
    })
  })

  it('computes correct sums per type', () => {
    resetSeq()
    const txs = [
      makeTx({ type: 'income', amount: 5000 }),
      makeTx({ type: 'income', amount: 3000 }),
      makeTx({ type: 'expense', amount: 1500 }),
      makeTx({ type: 'expense', amount: 500 }),
      makeTx({ type: 'capital', amount: 10000 }),
      makeTx({ type: 'withdrawal', amount: 2000 }),
      makeTx({ type: 'asset', amount: 7500 }),
      makeTx({ type: 'liability', amount: 4000 }),
    ]
    const result = totals(txs)
    expect(result.income).toBe(8000)
    expect(result.expense).toBe(2000)
    expect(result.capital).toBe(10000)
    expect(result.withdrawal).toBe(2000)
    expect(result.asset).toBe(7500)
    expect(result.liability).toBe(4000)
    expect(result.net).toBe(8000 + 10000 - 2000 - 2000)
    expect(result.count).toBe(8)
  })

  it('avoids floating-point drift with fractional amounts', () => {
    resetSeq()
    const txs = [
      makeTx({ type: 'income', amount: 10.1 }),
      makeTx({ type: 'income', amount: 20.2 }),
      makeTx({ type: 'income', amount: 30.3 }),
    ]
    const result = totals(txs)
    expect(result.income).toBeCloseTo(60.6)
    expect(result.net).toBeCloseTo(60.6)
  })
})

describe('matchesFilter', () => {
  const tx: CalcTransaction = {
    id: 1,
    date: '2026-03-15',
    type: 'income',
    amount: 100,
    category_id: 5,
  }

  it('passes with no filter', () => {
    expect(matchesFilter(tx, {})).toBe(true)
  })

  it('filters by date_from (inclusive)', () => {
    expect(matchesFilter(tx, { date_from: '2026-03-15' })).toBe(true)
    expect(matchesFilter(tx, { date_from: '2026-03-16' })).toBe(false)
    expect(matchesFilter(tx, { date_from: '2026-02-01' })).toBe(true)
  })

  it('filters by date_to (inclusive)', () => {
    expect(matchesFilter(tx, { date_to: '2026-03-15' })).toBe(true)
    expect(matchesFilter(tx, { date_to: '2026-03-14' })).toBe(false)
    expect(matchesFilter(tx, { date_to: '2026-04-01' })).toBe(true)
  })

  it('filters by types', () => {
    expect(matchesFilter(tx, { types: ['income'] })).toBe(true)
    expect(matchesFilter(tx, { types: ['expense'] })).toBe(false)
    expect(matchesFilter(tx, { types: ['income', 'expense'] })).toBe(true)
  })

  it('filters by category_ids', () => {
    expect(matchesFilter(tx, { category_ids: [5] })).toBe(true)
    expect(matchesFilter(tx, { category_ids: [99] })).toBe(false)
    expect(matchesFilter(tx, { category_ids: [5, 6] })).toBe(true)
  })

  it('rejects null category_id when filtering', () => {
    const noCategory: CalcTransaction = { ...tx, category_id: null }
    expect(matchesFilter(noCategory, { category_ids: [5] })).toBe(false)
  })

  it('applies multiple filter conditions', () => {
    expect(matchesFilter(tx, { date_from: '2026-01-01', date_to: '2026-06-30', types: ['income'] })).toBe(true)
    expect(matchesFilter(tx, { date_from: '2026-04-01', types: ['income'] })).toBe(false)
    expect(matchesFilter(tx, { date_from: '2026-01-01', types: ['expense'] })).toBe(false)
  })
})

describe('applyFilter', () => {
  it('filters a list of transactions', () => {
    resetSeq()
    const txs = [
      makeTx({ date: '2026-01-10', type: 'income', amount: 100 }),
      makeTx({ date: '2026-02-15', type: 'expense', amount: 200 }),
      makeTx({ date: '2026-03-20', type: 'income', amount: 300 }),
    ]
    const result = applyFilter(txs, { types: ['income'] })
    expect(result).toHaveLength(2)
    expect(result.map((t) => t.amount)).toEqual([100, 300])
  })
})

describe('monthlySummary', () => {
  it('returns empty array for empty input with no bounds', () => {
    expect(monthlySummary([])).toEqual([])
  })

  it('groups transactions by month and zero-fills gaps', () => {
    resetSeq()
    const txs = [
      makeTx({ date: '2026-01-05', type: 'income', amount: 100 }),
      makeTx({ date: '2026-01-20', type: 'income', amount: 200 }),
      makeTx({ date: '2026-03-10', type: 'expense', amount: 50 }),
    ]
    const result = monthlySummary(txs)
    expect(result).toHaveLength(3)
    expect(result[0].month).toBe('2026-01')
    expect(result[0].income).toBe(300)
    expect(result[0].count).toBe(2)
    expect(result[1].month).toBe('2026-02')
    expect(result[1].income).toBe(0)
    expect(result[1].count).toBe(0)
    expect(result[2].month).toBe('2026-03')
    expect(result[2].expense).toBe(50)
  })

  it('zero-fills months between explicit bounds', () => {
    resetSeq()
    const txs = [
      makeTx({ date: '2026-01-05', type: 'income', amount: 100 }),
      makeTx({ date: '2026-03-10', type: 'income', amount: 200 }),
    ]
    const result = monthlySummary(txs, { from: '2026-01-01', to: '2026-03-31' })
    expect(result).toHaveLength(3)
    expect(result[0].month).toBe('2026-01')
    expect(result[0].income).toBe(100)
    expect(result[1].month).toBe('2026-02')
    expect(result[1].income).toBe(0)
    expect(result[1].count).toBe(0)
    expect(result[2].month).toBe('2026-03')
    expect(result[2].income).toBe(200)
  })

  it('fills zero months using only explicit bounds when no transactions', () => {
    const result = monthlySummary([], { from: '2026-04-01', to: '2026-06-30' })
    expect(result).toHaveLength(3)
    expect(result[0].month).toBe('2026-04')
    expect(result[1].month).toBe('2026-05')
    expect(result[2].month).toBe('2026-06')
  })

  it('clamps to the single explicit month when only from is provided', () => {
    const result = monthlySummary([], { from: '2026-07-01' })
    expect(result).toHaveLength(1)
    expect(result[0].month).toBe('2026-07')
  })

  it('computes net correctly per month', () => {
    resetSeq()
    const txs = [
      makeTx({ date: '2026-06-01', type: 'income', amount: 1000 }),
      makeTx({ date: '2026-06-10', type: 'capital', amount: 500 }),
      makeTx({ date: '2026-06-15', type: 'expense', amount: 200 }),
      makeTx({ date: '2026-06-20', type: 'withdrawal', amount: 100 }),
    ]
    const result = monthlySummary(txs)
    expect(result[0].net).toBe(1000 + 500 - 200 - 100)
  })

  it('handles fractional amounts without drift', () => {
    resetSeq()
    const txs = [
      makeTx({ date: '2026-08-01', type: 'income', amount: 10.1 }),
      makeTx({ date: '2026-08-02', type: 'income', amount: 20.2 }),
    ]
    const result = monthlySummary(txs)
    expect(result[0].income).toBeCloseTo(30.3)
  })
})

describe('categoryBreakdown', () => {
  it('returns empty array for empty input', () => {
    expect(categoryBreakdown([])).toEqual([])
  })

  it('groups transactions by category and aggregates totals', () => {
    resetSeq()
    const txs = [
      makeTx({ category_id: 1, category_name: 'Salary', type: 'income', amount: 5000 }),
      makeTx({ category_id: 1, category_name: 'Salary', type: 'income', amount: 3000 }),
      makeTx({ category_id: 2, category_name: 'Food', type: 'expense', amount: 200 }),
    ]
    const result = categoryBreakdown(txs)
    expect(result).toHaveLength(2)
    const salary = result.find((r) => r.category_id === 1)!
    expect(salary.total).toBe(8000)
    expect(salary.count).toBe(2)
    const food = result.find((r) => r.category_id === 2)!
    expect(food.total).toBe(200)
  })

  it('sorts by type then descending total', () => {
    resetSeq()
    const txs = [
      makeTx({ category_id: 10, category_name: 'Cheap', type: 'expense', amount: 50 }),
      makeTx({ category_id: 20, category_name: 'Pricey', type: 'expense', amount: 500 }),
      makeTx({ category_id: 30, category_name: 'Income A', type: 'income', amount: 1000 }),
    ]
    const result = categoryBreakdown(txs)
    expect(result[0].type).toBe('expense')
    expect(result[0].category_name).toBe('Pricey')
    expect(result[1].type).toBe('expense')
    expect(result[1].category_name).toBe('Cheap')
    expect(result[2].type).toBe('income')
  })

  it('uses a fallback name when category_name is missing', () => {
    resetSeq()
    const txs = [
      makeTx({ category_id: 42, category_name: undefined, type: 'income', amount: 100 }),
    ]
    const result = categoryBreakdown(txs)
    expect(result[0].category_name).toBe('Category 42')
  })

  it('skips transactions with null category_id', () => {
    resetSeq()
    const txs = [
      makeTx({ category_id: null, type: 'income', amount: 100 }),
    ]
    expect(categoryBreakdown(txs)).toEqual([])
  })
})