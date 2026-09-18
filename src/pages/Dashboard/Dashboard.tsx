import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import CashFlowChart from '../../components/charts/CashFlowChart'
import { api, ApiError } from '../../services/api'
import { useSettings } from '../../contexts/SettingsContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate, parseISODate } from '../../utils/dates'
import { cashFlowPointsToChartData } from '../../utils/chart'
import {
  cashFlowGranularity,
  customRangeInvalid,
  PERIOD_KEYS,
  PERIOD_LABELS,
  periodRange,
  type PeriodKey,
} from '../../utils/periods'
import { logToMain } from '../../services/logger'
import type {
  CalculationFilter,
  CalculationTotals,
  CashFlowPoint,
  CategoryBreakdown,
  Transaction,
  TransactionPage,
} from '../../../electron/types/ipc'

function Dashboard(): React.JSX.Element {
  const { settings } = useSettings()
  const currencyCode = settings?.currency ?? 'PHP'
  const dateFormat = settings?.dateFormat ?? 'YYYY-MM-DD'

  const [period, setPeriod] = useState<PeriodKey>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [totals, setTotals] = useState<CalculationTotals | null>(null)
  const [cashFlow, setCashFlow] = useState<CashFlowPoint[]>([])
  const [breakdown, setBreakdown] = useState<CategoryBreakdown[]>([])
  const [recent, setRecent] = useState<TransactionPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const range = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo])
  const granularity = useMemo(() => cashFlowGranularity(range), [range])
  const customInvalid = customRangeInvalid(customFrom, customTo)

  /** Single source of truth applied to every dashboard query. */
  const calcFilter = useMemo<CalculationFilter>(
    () => ({
      ...(range.date_from ? { date_from: range.date_from } : {}),
      ...(range.date_to ? { date_to: range.date_to } : {}),
    }),
    [range],
  )

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    if (customInvalid) {
      setLoading(false)
      return
    }

    try {
      const [totalsResult, cashFlowResult, breakdownResult, recentResult] = await Promise.all([
        api.calculations.totals(calcFilter),
        api.calculations.cashFlow(calcFilter, granularity),
        api.calculations.byCategory(calcFilter),
        api.transactions.list({
          page: 1,
          page_size: 8,
          sort_by: 'date',
          sort_dir: 'desc',
          ...(calcFilter.date_from ? { date_from: calcFilter.date_from } : {}),
          ...(calcFilter.date_to ? { date_to: calcFilter.date_to } : {}),
        }),
      ])
      setTotals(totalsResult)
      setCashFlow(cashFlowResult)
      setBreakdown(breakdownResult)
      setRecent(recentResult)
    } catch (err) {
      const message = (err as ApiError).message ?? 'Dashboard data could not be loaded.'
      setError(message)
      logToMain('error', 'load dashboard failed', { message })
    } finally {
      setLoading(false)
    }
  }, [calcFilter, granularity, customInvalid])

  useEffect(() => {
    void load()
  }, [load])

  const income = totals?.income ?? 0
  const expense = totals?.expense ?? 0
  const netPosition = income - expense
  const netCapital = (totals?.capital ?? 0) - (totals?.withdrawal ?? 0)

  const chartData = useMemo(() => cashFlowPointsToChartData(cashFlow, granularity), [cashFlow, granularity])
  const hasMovement = chartData.some((d) => d.inflow !== 0 || d.outflow !== 0 || d.net !== 0)

  const incomeCategories = useMemo(
    () => breakdown.filter((c) => c.type === 'income').slice(0, 5),
    [breakdown],
  )
  const expenseCategories = useMemo(
    () => breakdown.filter((c) => c.type === 'expense').slice(0, 5),
    [breakdown],
  )

  const periodLabel = useMemo(() => {
    const from = range.date_from ? formatDate(parseISODate(range.date_from), dateFormat) : null
    const to = range.date_to ? formatDate(parseISODate(range.date_to), dateFormat) : null
    if (from && to) {
      return `${from} – ${to}`
    }
    if (from) {
      return `From ${from}`
    }
    if (to) {
      return `Up to ${to}`
    }
    return 'All time'
  }, [range, dateFormat])

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        description="A quick look at your finances for the selected period."
      />

      {/* Period selector */}
      <div className="card page-toolbar">
        <div className="period-selector" role="radiogroup" aria-label="Time period">
          {PERIOD_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`btn btn--segment${period === key ? ' btn--segment-active' : ''}`}
              role="radio"
              aria-checked={period === key}
              onClick={() => setPeriod(key)}
            >
              {PERIOD_LABELS[key]}
            </button>
          ))}
          <button
            type="button"
            className={`btn btn--segment${period === 'custom' ? ' btn--segment-active' : ''}`}
            role="radio"
            aria-checked={period === 'custom'}
            onClick={() => setPeriod('custom')}
          >
            Custom
          </button>
        </div>

        {period === 'custom' && (
          <div className="period-custom">
            <label className="field__label" htmlFor="dash-from">From</label>
            <input
              id="dash-from"
              type="date"
              className="text-input text-input--sm"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <label className="field__label" htmlFor="dash-to">To</label>
            <input
              id="dash-to"
              type="date"
              className="text-input text-input--sm"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        )}
      </div>

      {customInvalid ? (
        <div role="alert" className="notice notice--error">
          The "From" date must be on or before the "To" date.
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="notice notice--error">{error}</div>
      ) : null}

      {loading && !totals ? (
        <div className="spinner" style={{ margin: '24px auto' }} aria-label="Loading dashboard" />
      ) : totals ? (
        <>
          {/* Summary cards */}
          <div className="dash-summary">
            <div className="card page-summary__card">
              <span className="page-summary__label">Total Income</span>
              <span className="page-summary__value page-summary__value--positive">
                {formatCurrency(income, currencyCode)}
              </span>
            </div>
            <div className="card page-summary__card">
              <span className="page-summary__label">Total Expenses</span>
              <span className="page-summary__value page-summary__value--negative">
                {formatCurrency(expense, currencyCode)}
              </span>
            </div>
            <div className="card page-summary__card">
              <span className="page-summary__label">Net Position</span>
              <span className={`page-summary__value ${netPosition >= 0 ? 'page-summary__value--positive' : 'page-summary__value--negative'}`}>
                {formatCurrency(netPosition, currencyCode)}
              </span>
            </div>
            <div className="card page-summary__card">
              <span className="page-summary__label">Net Capital</span>
              <span className={`page-summary__value ${netCapital >= 0 ? 'page-summary__value--positive' : 'page-summary__value--negative'}`}>
                {formatCurrency(netCapital, currencyCode)}
              </span>
            </div>
          </div>

          {/* Cash flow + recent transactions */}
          <div className="dash-lower">
            <div className="card dash-cf">
              <div className="dash-cf__heading">
                <h3 className="card__title">Cash Flow Over Time</h3>
                <span className="dash-range-label">{periodLabel}</span>
              </div>
              <CashFlowChart data={chartData} currencyCode={currencyCode} height={220} />

              {hasMovement && (
                <div className="tx-table-wrap dash-cf__table">
                  <table className="tx-table tx-table--compact">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th className="tx-table__amount">Income</th>
                        <th className="tx-table__amount">Expenses</th>
                        <th className="tx-table__amount">Net Cash Flow</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row) => (
                        <tr key={row.key}>
                          <td>{row.fullLabel}</td>
                          <td className="tx-table__amount">{formatCurrency(row.inflow, currencyCode)}</td>
                          <td className="tx-table__amount">{formatCurrency(row.outflow, currencyCode)}</td>
                          <td className={`tx-table__amount ${row.net >= 0 ? 'cf-positive' : 'cf-negative'}`}>
                            {formatCurrency(row.net, currencyCode)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card dash-recent">
              <h3 className="card__title">Recent Transactions</h3>
              {recent && recent.transactions.length > 0 ? (
                <ul className="dash-list">
                  {recent.transactions.slice(0, 8).map((tx: Transaction) => (
                    <li key={tx.id} className="dash-list__item">
                      <div className="dash-list__main">
                        <span className="dash-list__desc">{tx.description}</span>
                        <span className="dash-list__meta">
                          {formatDate(parseISODate(tx.date), dateFormat)} · {tx.category_name}
                        </span>
                      </div>
                      <div className="dash-list__right">
                        <span className={`dash-list__amount ${tx.type === 'expense' || tx.type === 'withdrawal' ? 'cf-negative' : 'cf-positive'}`}>
                          {formatCurrency(tx.amount, currencyCode)}
                        </span>
                        <span className={`badge badge--${tx.type}`}>{tx.type}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dash-recent__empty">No transactions for this period.</p>
              )}
            </div>
          </div>

          {/* Top categories */}
          {(incomeCategories.length > 0 || expenseCategories.length > 0) && (
            <div className="dash-cats">
              {expenseCategories.length > 0 && (
                <div className="card">
                  <h3 className="card__title">Top Expense Categories</h3>
                  <table className="ib-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="ib-table__right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseCategories.map((cat) => (
                        <tr key={cat.category_id}>
                          <td>{cat.category_name}</td>
                          <td className="ib-table__right">{formatCurrency(cat.total, currencyCode)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {incomeCategories.length > 0 && (
                <div className="card">
                  <h3 className="card__title">Top Income Categories</h3>
                  <table className="ib-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="ib-table__right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomeCategories.map((cat) => (
                        <tr key={cat.category_id}>
                          <td>{cat.category_name}</td>
                          <td className="ib-table__right">{formatCurrency(cat.total, currencyCode)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

export default Dashboard