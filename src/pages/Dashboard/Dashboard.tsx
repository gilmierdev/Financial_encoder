import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import CashFlowChart from '../../components/charts/CashFlowChart'
import CategoryProgressList from '../../components/ui/CategoryProgressList'
import TransactionForm from '../../components/transactions/TransactionForm'
import { Icon } from '../../components/ui/Icon'
import { api, ApiError } from '../../services/api'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
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
  TransactionType,
} from '../../../electron/types/ipc'

function Dashboard(): React.JSX.Element {
  const { settings } = useSettings()
  const { success } = useToast()
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

  // Local quick transaction form
  const [formOpen, setFormOpen] = useState(false)
  const [formDefaultType, setFormDefaultType] = useState<TransactionType>('expense')

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
          page_size: 7,
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

  // Listen for global transaction events to auto refresh
  useEffect(() => {
    const handleSaved = () => {
      void load()
    }
    window.addEventListener('transaction-saved', handleSaved)
    return () => window.removeEventListener('transaction-saved', handleSaved)
  }, [load])

  const income = totals?.income ?? 0
  const expense = totals?.expense ?? 0
  const netPosition = income - expense
  const netCapital = (totals?.capital ?? 0) - (totals?.withdrawal ?? 0)

  // Calculations for secondary metrics
  const savingsRate = income > 0 ? Math.max(0, ((income - expense) / income) * 100) : 0
  const expenseRatio = income > 0 ? (expense / income) * 100 : 0

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

  const openQuickAdd = (type: TransactionType): void => {
    setFormDefaultType(type)
    setFormOpen(true)
  }

  const handleTxSaved = (saved: Transaction): void => {
    setFormOpen(false)
    success(`Recorded ${saved.type} "${saved.description}"`)
    void load()
  }

  return (
    <div className="page dashboard-page">
      <PageHeader
        title="Dashboard"
        description="Executive financial overview, performance health, and cash flow trajectory."
        actions={
          <div className="dash-header-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => openQuickAdd('expense')}
            >
              <Icon name="plus" size={15} />
              <span>Log Transaction</span>
            </button>
          </div>
        }
      />

      {/* Quick Action Navigation Strip */}
      <div className="dash-quick-actions" role="toolbar" aria-label="Quick actions">
        <button
          type="button"
          className="dash-action-btn dash-action-btn--income"
          onClick={() => openQuickAdd('income')}
          title="Quick log income"
        >
          <span className="dash-action-btn__icon">
            <Icon name="arrowDown" size={16} />
          </span>
          <div className="dash-action-btn__text">
            <span className="dash-action-btn__label">+ Log Income</span>
            <span className="dash-action-btn__sub">Record earnings</span>
          </div>
        </button>

        <button
          type="button"
          className="dash-action-btn dash-action-btn--expense"
          onClick={() => openQuickAdd('expense')}
          title="Quick log expense"
        >
          <span className="dash-action-btn__icon">
            <Icon name="arrowUp" size={16} />
          </span>
          <div className="dash-action-btn__text">
            <span className="dash-action-btn__label">- Log Expense</span>
            <span className="dash-action-btn__sub">Record spend</span>
          </div>
        </button>

        <Link to="/documents" className="dash-action-btn" title="Scan receipt or statement">
          <span className="dash-action-btn__icon">
            <Icon name="receipt" size={16} />
          </span>
          <div className="dash-action-btn__text">
            <span className="dash-action-btn__label">Scan Receipt</span>
            <span className="dash-action-btn__sub">OCR Document</span>
          </div>
        </Link>

        <Link to="/import" className="dash-action-btn" title="Import CSV or Excel">
          <span className="dash-action-btn__icon">
            <Icon name="fileSpreadsheet" size={16} />
          </span>
          <div className="dash-action-btn__text">
            <span className="dash-action-btn__label">Import CSV</span>
            <span className="dash-action-btn__sub">Batch ingestion</span>
          </div>
        </Link>

        <Link to="/reports" className="dash-action-btn" title="Generate Financial Report">
          <span className="dash-action-btn__icon">
            <Icon name="reports" size={16} />
          </span>
          <div className="dash-action-btn__text">
            <span className="dash-action-btn__label">Reports</span>
            <span className="dash-action-btn__sub">PDF / Excel export</span>
          </div>
        </Link>
      </div>

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

        <div className="dash-period-meta">
          <span className="dash-range-pill">{periodLabel}</span>
        </div>
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
        <div className="spinner" style={{ margin: '32px auto' }} aria-label="Loading dashboard" />
      ) : totals ? (
        <>
          {/* Enhanced Modern Stat Cards */}
          <div className="dash-summary">
            {/* Total Income */}
            <div className="card stat-card stat-card--income">
              <div className="stat-card__head">
                <span className="stat-card__label">Total Income</span>
                <div className="stat-card__icon" aria-hidden="true">
                  <Icon name="arrowDown" size={17} />
                </div>
              </div>
              <span className="stat-card__value stat-card__value--positive">
                {formatCurrency(income, currencyCode)}
              </span>
              <div className="stat-card__footer">
                {income > 0 ? (
                  <span className="stat-card__badge stat-card__badge--ok">
                    <Icon name="trendingUp" size={12} />
                    <span>{savingsRate.toFixed(1)}% savings rate</span>
                  </span>
                ) : (
                  <span className="stat-card__subtext">No income in range</span>
                )}
              </div>
            </div>

            {/* Total Expenses */}
            <div className="card stat-card stat-card--expense">
              <div className="stat-card__head">
                <span className="stat-card__label">Total Expenses</span>
                <div className="stat-card__icon" aria-hidden="true">
                  <Icon name="arrowUp" size={17} />
                </div>
              </div>
              <span className="stat-card__value stat-card__value--negative">
                {formatCurrency(expense, currencyCode)}
              </span>
              <div className="stat-card__footer">
                {income > 0 ? (
                  <span className={`stat-card__badge ${expenseRatio > 80 ? 'stat-card__badge--warn' : 'stat-card__badge--neutral'}`}>
                    <span>{expenseRatio.toFixed(1)}% of income</span>
                  </span>
                ) : (
                  <span className="stat-card__subtext">Operating outflows</span>
                )}
              </div>
            </div>

            {/* Net Position */}
            <div className="card stat-card stat-card--net">
              <div className="stat-card__head">
                <span className="stat-card__label">Net Position</span>
                <div className="stat-card__icon" aria-hidden="true">
                  <Icon name="wallet" size={17} />
                </div>
              </div>
              <span className={`stat-card__value ${netPosition >= 0 ? 'stat-card__value--positive' : 'stat-card__value--negative'}`}>
                {formatCurrency(netPosition, currencyCode)}
              </span>
              <div className="stat-card__footer">
                <span className={`stat-card__badge ${netPosition >= 0 ? 'stat-card__badge--ok' : 'stat-card__badge--danger'}`}>
                  <span>{netPosition >= 0 ? 'Surplus Reserve' : 'Deficit'}</span>
                </span>
              </div>
            </div>

            {/* Net Capital */}
            <div className="card stat-card stat-card--capital">
              <div className="stat-card__head">
                <span className="stat-card__label">Net Capital</span>
                <div className="stat-card__icon" aria-hidden="true">
                  <Icon name="capital" size={17} />
                </div>
              </div>
              <span className={`stat-card__value ${netCapital >= 0 ? 'stat-card__value--positive' : 'stat-card__value--negative'}`}>
                {formatCurrency(netCapital, currencyCode)}
              </span>
              <div className="stat-card__footer">
                <span className="stat-card__subtext">
                  Equity &amp; investment balance
                </span>
              </div>
            </div>
          </div>

          {/* Cash flow + recent transactions */}
          <div className="dash-lower">
            <div className="card dash-cf">
              <div className="dash-cf__heading">
                <div>
                  <h3 className="card__title">Cash Flow Trajectory</h3>
                  <span className="dash-cf__subtitle">Inflows vs Outflows over the selected timeline</span>
                </div>
                <span className="dash-range-pill">{periodLabel}</span>
              </div>

              <CashFlowChart data={chartData} currencyCode={currencyCode} height={230} />

              {hasMovement && (
                <div className="tx-table-wrap dash-cf__table">
                  <table className="tx-table tx-table--compact">
                    <thead>
                      <tr>
                        <th>Timeline</th>
                        <th className="tx-table__amount">Inflow</th>
                        <th className="tx-table__amount">Outflow</th>
                        <th className="tx-table__amount">Net Movement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row) => (
                        <tr key={row.key}>
                          <td>{row.fullLabel}</td>
                          <td className="tx-table__amount cf-positive">
                            +{formatCurrency(row.inflow, currencyCode)}
                          </td>
                          <td className="tx-table__amount cf-negative">
                            -{formatCurrency(row.outflow, currencyCode)}
                          </td>
                          <td className={`tx-table__amount ${row.net >= 0 ? 'cf-positive' : 'cf-negative'}`}>
                            {row.net >= 0 ? '+' : ''}{formatCurrency(row.net, currencyCode)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card dash-recent">
              <div className="dash-recent__header">
                <div>
                  <h3 className="card__title">Recent Activity</h3>
                  <span className="dash-recent__subtitle">Latest logged movements</span>
                </div>
                <Link to="/transactions" className="dash-view-all-link">
                  <span>View all</span>
                  <Icon name="chevronRight" size={14} />
                </Link>
              </div>

              {recent && recent.transactions.length > 0 ? (
                <ul className="dash-list">
                  {recent.transactions.slice(0, 7).map((tx: Transaction) => {
                    const isOutflow = tx.type === 'expense' || tx.type === 'withdrawal'
                    return (
                      <li key={tx.id} className="dash-list__item">
                        <div className="dash-list__main">
                          <span className="dash-list__desc" title={tx.description}>
                            {tx.description}
                          </span>
                          <span className="dash-list__meta">
                            {formatDate(parseISODate(tx.date), dateFormat)} · {tx.category_name}
                          </span>
                        </div>
                        <div className="dash-list__right">
                          <span className={`dash-list__amount ${isOutflow ? 'cf-negative' : 'cf-positive'}`}>
                            {isOutflow ? '-' : '+'}{formatCurrency(tx.amount, currencyCode)}
                          </span>
                          <span className={`badge badge--${tx.type}`}>{tx.type}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="dash-recent__empty-box">
                  <Icon name="transactions" size={28} />
                  <p>No transactions logged in this period.</p>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => openQuickAdd('expense')}
                  >
                    + Add your first transaction
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Visual Category Breakdown Progress Meters */}
          <div className="dash-cats">
            <div className="card">
              <div className="card__head-flex">
                <h3 className="card__title">Top Expense Streams</h3>
                <Link to="/expenses" className="card__sublink">
                  Full Breakdown →
                </Link>
              </div>
              <CategoryProgressList
                items={expenseCategories}
                currencyCode={currencyCode}
                emptyMessage="No expenses recorded for this timeframe."
                maxItems={5}
              />
            </div>

            <div className="card">
              <div className="card__head-flex">
                <h3 className="card__title">Top Income Sources</h3>
                <Link to="/income" className="card__sublink">
                  Full Breakdown →
                </Link>
              </div>
              <CategoryProgressList
                items={incomeCategories}
                currencyCode={currencyCode}
                emptyMessage="No income recorded for this timeframe."
                maxItems={5}
              />
            </div>
          </div>
        </>
      ) : null}

      {/* Quick Add Form from Dashboard */}
      <TransactionForm
        open={formOpen}
        defaultType={formDefaultType}
        transaction={null}
        onClose={() => setFormOpen(false)}
        onSaved={handleTxSaved}
      />
    </div>
  )
}

export default Dashboard