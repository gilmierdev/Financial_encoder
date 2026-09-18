import type { CashFlowGranularity, CashFlowPoint, MonthlySummary } from '../../electron/types/ipc'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Normalised datum consumed by the cash-flow chart.
 * `inflow` is money coming in (plotted above zero) and `outflow` is the
 * positive magnitude of money going out (plotted below zero).
 */
export interface CashFlowChartDatum {
  key: string
  label: string
  fullLabel: string
  inflow: number
  outflow: number
  net: number
}

function shortParts(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map((part) => Number(part))
  return { y, m, d }
}

function monthDatum(key: string): { label: string; fullLabel: string } {
  const { y, m } = shortParts(key)
  return {
    label: `${MONTHS_SHORT[m - 1]} ${y}`,
    fullLabel: `${MONTHS_LONG[m - 1]} ${y}`,
  }
}

function dayDatum(key: string): { label: string; fullLabel: string } {
  const { y, m, d } = shortParts(key)
  return {
    label: `${MONTHS_SHORT[m - 1]} ${d}`,
    fullLabel: `${MONTHS_LONG[m - 1]} ${d}, ${y}`,
  }
}

function weekDatum(key: string): { label: string; fullLabel: string } {
  const { y, m, d } = shortParts(key)
  return {
    label: `Wk ${MONTHS_SHORT[m - 1]} ${d}`,
    fullLabel: `Week of ${MONTHS_LONG[m - 1]} ${d}, ${y}`,
  }
}

/** Converts a cash-flow time series into chart-ready data. */
export function cashFlowPointsToChartData(
  points: CashFlowPoint[],
  granularity: CashFlowGranularity,
): CashFlowChartDatum[] {
  return points.map((point) => {
    const label =
      granularity === 'month' ? monthDatum(point.key) : granularity === 'week' ? weekDatum(point.key) : dayDatum(point.key)
    return {
      key: point.key,
      label: label.label,
      fullLabel: label.fullLabel,
      inflow: point.income,
      outflow: point.expense,
      net: point.income - point.expense,
    }
  })
}

/**
 * Converts a monthly summary into chart data. When `includeCapital` is true,
 * capital is treated as cash coming in and withdrawals as cash going out.
 */
export function monthlyToCashFlowChartData(
  rows: MonthlySummary[],
  includeCapital: boolean,
): CashFlowChartDatum[] {
  return rows.map((row) => {
    const inflow = includeCapital ? row.income + row.capital : row.income
    const outflow = includeCapital ? row.expense + row.withdrawal : row.expense
    const label = monthDatum(row.month)
    return {
      key: row.month,
      label: label.label,
      fullLabel: label.fullLabel,
      inflow,
      outflow,
      net: inflow - outflow,
    }
  })
}

/**
 * Builds a padded Y-axis domain that always includes zero.
 *
 * - all-zero data gets a small symmetric domain
 * - all-positive data starts at zero
 * - all-negative data ends at zero
 * - mixed data is padded above and below
 */
export function computeChartYDomain(values: number[]): [number, number] {
  let min = 0
  let max = 0

  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue
    }
    if (value < min) {
      min = value
    }
    if (value > max) {
      max = value
    }
  }

  if (min === 0 && max === 0) {
    return [0, 1]
  }

  const span = max - min
  const padding = span > 0 ? span * 0.12 : Math.max(Math.abs(max), Math.abs(min), 1) * 0.12

  return [min < 0 ? min - padding : 0, max > 0 ? max + padding : 0]
}
