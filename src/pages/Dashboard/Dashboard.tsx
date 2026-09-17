import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import CashFlowChart from '../../components/charts/CashFlowChart'
import { api, ApiError } from '../../services/api'
import { useSettings } from '../../contexts/SettingsContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate, parseISODate } from '../../utils/dates'
import {
  cashFlowWindow,
  customRangeInvalid,
  formatMonth,
  PERIOD_KEYS,
  PERIOD_LABELS,
  periodRange,
  type PeriodKey,
} from '../../utils/periods'
import { logToMain } from '../../services/logger'
import type {
  CalculationFilter,
  CalculationTotals,
  CategoryBreakdown,
  MonthlySummary,
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
  const [monthly, setMonthly] = useState<MonthlySummary[]>([])
  const [breakdown, setBreakdown] = useState<CategoryBreakdown[]>([])
  const [recent, setRecent] = useState<TransactionPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const range = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo])
  const cashRange = useMemo(() => cashFlowWindow(range.date_to, range.date_from), [range.date_from, range.date_to])
  const customInvalid = customRangeInvalid(customFrom, customTo)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    if (customInvalid) {
      setLoading(false)
      return
    }

    const calcFilter: CalculationFilter = {
      ...(range.date_from ? { date_from: range.date_from } : {}),
      ...(range.date_to ? { date_to: range.date_to } : {}),
    }
    const cashFilter: CalculationFilter = {
      date_from: cashRange.date_from,
      date_to: cashRange.date_to,
    }

    try {
      const [totalsResult, monthlyResult, breakdownResult, recentResult] = await Promise.all([
        api.calculations.totals(calcFilter),
        api.calculations.monthly(cashFilter),
        api.calculations.byCategory(calcFilter),
        api.transactions.list({ page: 1, page_size: 8, sort_by: 'date', sort_dir: 'desc' }),
      ])
      setTotals(totalsResult)
      setMonthly(monthlyResult)
      setBreakdown(breakdownResult)
      setRecent(recentResult)
    } catch (err) {
      const message = (err as ApiError).message ?? 'Dashboard data could not be loaded.'
      setError(message)
      logToMain('error', 'load dashboard failed', { message })
    } finally {
      setLoading(false)
    }
  }, [range, cashRange, customInvalid])

  useEffect(() => {
    void load()
  }, [load])

  const income = totals?.income ?? 0
  const expense = totals?.expense ?? 0
  const net = (totals?.net ?? 0)

  const incomeCategories = useMemo(
    () => breakdown.filter((c) => c.type === 'income').slice(0, 5),
    [breakdown],
  )
  const expenseCategories = useMemo(
    () => breakdown.filter((c) => c.type === 'expense').slice(0, 5),
    [breakdown],
  )

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
              <span className={`page-summary__value ${net >= 0 ? 'page-summary__value--positive' : 'page-summary__value--negative'}`}>
                {formatCurrency(net, currencyCode)}
              </span>
            </div>
            <div className="card page-summary__card">
              <span className="page-summary__label">Net Capital</span>
              <span className={`page-summary__value ${(totals.capital - totals.withdrawal) >= 0 ? 'page-summary__value--positive' : 'page-summary__value--negative'}`}>
                {formatCurrency(totals.capital - totals.withdrawal, currencyCode)}
              </span>
            </div>
          </div>

          {/* Cash flow + recent transactions */}
          {monthly.length > 0 || (recent && recent.transactions.length > 0) ? (
            <div className="dash-lower">
              {monthly.length > 0 && (
                <div className="card dash-cf">
                  <h3 className="card__title">Cash Flow Over Time</h3>
                  <CashFlowChart data={monthly} currencyCode={currencyCode} height={220} />
                  <table className="ib-table" style={{ marginTop: 16 }}>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="ib-table__right">In</th>
                        <th className="ib-table__right">Out</th>
                        <th className="ib-table__right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((row) => {
                        const inflow = row.income + row.capital
                        const outflow = row.expense + row.withdrawal
                        const rowNet = inflow - outflow
                        return (
                          <tr key={row.month}>
                            <td>{formatMonth(row.month)}</td>
                            <td className="ib-table__right">{formatCurrency(inflow, currencyCode)}</td>
                            <td className="ib-table__right">{formatCurrency(outflow, currencyCode)}</td>
                            <td className={`ib-table__right ${rowNet >= 0 ? 'cf-positive' : 'cf-negative'}`}>
                              {formatCurrency(rowNet, currencyCode)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {recent && recent.transactions.length > 0 && (
                <div className="card dash-recent">
                  <h3 className="card__title">Recent Transactions</h3>
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
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon="dashboard"
              title="No data yet"
              description="Record your first transaction and this dashboard will summarise your finances."
            />
          )}

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