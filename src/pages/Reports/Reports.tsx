import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import CashFlowChart from '../../components/charts/CashFlowChart'
import { api, ApiError } from '../../services/api'
import { useSettings } from '../../contexts/SettingsContext'
import { formatCurrency } from '../../utils/currency'
import {
  customRangeInvalid,
  formatMonth,
  PERIOD_KEYS,
  PERIOD_LABELS,
  periodRange,
  type PeriodKey,
} from '../../utils/periods'
import { monthlyToCashFlowChartData } from '../../utils/chart'
import { logToMain } from '../../services/logger'
import type {
  CalculationFilter,
  CalculationTotals,
  CategoryBreakdown,
  MonthlySummary,
} from '../../../electron/types/ipc'

function Reports(): React.JSX.Element {
  const { settings } = useSettings()
  const currencyCode = settings?.currency ?? 'PHP'

  const [period, setPeriod] = useState<PeriodKey>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [totals, setTotals] = useState<CalculationTotals | null>(null)
  const [breakdown, setBreakdown] = useState<CategoryBreakdown[]>([])
  const [monthly, setMonthly] = useState<MonthlySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const range = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo])
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

    try {
      const [totalsResult, breakdownResult, monthlyResult] = await Promise.all([
        api.calculations.totals(calcFilter),
        api.calculations.byCategory(calcFilter),
        api.calculations.monthly(calcFilter),
      ])
      setTotals(totalsResult)
      setBreakdown(breakdownResult)
      setMonthly(monthlyResult)
    } catch (err) {
      const message = (err as ApiError).message ?? 'Report data could not be loaded.'
      setError(message)
      logToMain('error', 'load reports failed', { message })
    } finally {
      setLoading(false)
    }
  }, [range, customInvalid])

  useEffect(() => {
    void load()
  }, [load])

  const breakdownByType = useMemo(() => {
    const groups: Record<string, CategoryBreakdown[]> = {}
    for (const row of breakdown) {
      (groups[row.type] ??= []).push(row)
    }
    return groups
  }, [breakdown])

  const hasData = totals ? totals.count > 0 : false
  const periodLabel = period === 'custom' || !PERIOD_LABELS[period]
    ? `${customFrom || 'Start'} – ${customTo || 'Now'}`
    : PERIOD_LABELS[period]

  const chartData = useMemo(() => monthlyToCashFlowChartData(monthly, true), [monthly])

  const [exporting, setExporting] = useState<'csv' | 'xlsx' | 'pdf' | null>(null)

  async function exportReport(format: 'csv' | 'xlsx' | 'pdf'): Promise<void> {
    setExporting(format)
    setError(null)
    try {
      await api.exports.file({ format, filter: { ...range } })
      logToMain('info', 'report export requested', { format })
    } catch (err) {
      if ((err as ApiError).message !== 'Export cancelled.') {
        setError((err as ApiError).message ?? 'The report could not be exported.')
      }
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="page report-page">
      <PageHeader
        title="Reports"
        description="Income statement, cash flow and category summaries."
        actions={
          <>
            {exporting === null && (
              <button type="button" className="btn btn--secondary" onClick={() => window.print()}>
                Print
              </button>
            )}
            {(['csv', 'xlsx', 'pdf'] as const).map((format) => (
              <button
                key={format}
                type="button"
                className="btn btn--secondary"
                onClick={() => exportReport(format)}
                disabled={exporting !== null}
              >
                {exporting === format ? 'Exporting…' : `Export ${format.toUpperCase()}`}
              </button>
            ))}
          </>
        }
      />

      <div className="page-toolbar card" style={{ marginTop: 0 }}>
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
            <label className="field__label" htmlFor="report-from">From</label>
            <input
              id="report-from"
              type="date"
              className="text-input text-input--sm"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <label className="field__label" htmlFor="report-to">To</label>
            <input
              id="report-to"
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
        <div className="spinner" style={{ margin: '24px auto' }} aria-label="Loading report" />
      ) : !hasData ? (
        <EmptyState
          icon="reports"
          title="No data to report"
          description={period !== 'all' ? 'No transactions match the selected period.' : 'Record some transactions to generate reports.'}
        >
          {period !== 'all' && (
            <button type="button" className="btn btn--secondary" onClick={() => setPeriod('all')}>
              Show all
            </button>
          )}
        </EmptyState>
      ) : totals ? (
        <>
          <div className="report-grid">
            {/* Income statement */}
            <div className="card report-block">
              <h3 className="card__title">Income Statement</h3>
              <p className="report-period">{periodLabel}</p>
              <table className="ib-table">
                <tbody>
                  <tr>
                    <td>Income</td>
                    <td className="ib-table__right">{formatCurrency(totals.income, currencyCode)}</td>
                  </tr>
                  <tr>
                    <td>Expenses</td>
                    <td className="ib-table__right">({formatCurrency(totals.expense, currencyCode)})</td>
                  </tr>
                  <tr className="ib-table__total">
                    <td><strong>Net Income</strong></td>
                    <td className={`ib-table__right ${totals.net >= 0 ? 'cf-positive' : 'cf-negative'}`}>
                      <strong>{formatCurrency(totals.net, currencyCode)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Cash flow */}
            <div className="card report-block">
              <h3 className="card__title">Cash Flow</h3>
              <p className="report-period">{periodLabel}</p>
              <table className="ib-table">
                <tbody>
                  <tr>
                    <td>Inflows</td>
                    <td className="ib-table__right">{formatCurrency(totals.income + totals.capital, currencyCode)}</td>
                  </tr>
                  <tr>
                    <td>Outflows</td>
                    <td className="ib-table__right">({formatCurrency(totals.expense + totals.withdrawal, currencyCode)})</td>
                  </tr>
                  <tr className="ib-table__total">
                    <td><strong>Net Cash Flow</strong></td>
                    <td className={`ib-table__right ${(totals.income + totals.capital - totals.expense - totals.withdrawal) >= 0 ? 'cf-positive' : 'cf-negative'}`}>
                      <strong>{formatCurrency(totals.income + totals.capital - totals.expense - totals.withdrawal, currencyCode)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Capital */}
            <div className="card report-block">
              <h3 className="card__title">Capital</h3>
              <p className="report-period">{periodLabel}</p>
              <table className="ib-table">
                <tbody>
                  <tr>
                    <td>Capital Added</td>
                    <td className="ib-table__right">{formatCurrency(totals.capital, currencyCode)}</td>
                  </tr>
                  <tr>
                    <td>Withdrawals</td>
                    <td className="ib-table__right">({formatCurrency(totals.withdrawal, currencyCode)})</td>
                  </tr>
                  <tr className="ib-table__total">
                    <td><strong>Net Capital</strong></td>
                    <td className={`ib-table__right ${(totals.capital - totals.withdrawal) >= 0 ? 'cf-positive' : 'cf-negative'}`}>
                      <strong>{formatCurrency(totals.capital - totals.withdrawal, currencyCode)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly cash flow chart */}
          {monthly.length > 0 && (
            <div className="card page-cf">
              <h3 className="card__title">Cash Flow Over Time</h3>
              <CashFlowChart
              data={chartData}
              currencyCode={currencyCode}
              height={280}
              labels={{ inflow: 'Inflows', outflow: 'Outflows', net: 'Net Cash Flow' }}
            />
            </div>
          )}

          {/* Category breakdown */}
          {breakdown.length > 0 && (
            <div className="card">
              <h3 className="card__title">Category Breakdown</h3>
              <div className="tx-table-wrap">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Type</th>
                      <th className="tx-table__amount">Count</th>
                      <th className="tx-table__amount">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['income', 'expense', 'capital', 'withdrawal', 'asset', 'liability'] as const).map((type) =>
                      (breakdownByType[type] ?? []).map((cat) => (
                        <tr key={cat.category_id}>
                          <td>{cat.category_name}</td>
                          <td><span className={`badge badge--${type}`}>{type}</span></td>
                          <td className="tx-table__amount">{cat.count}</td>
                          <td className="tx-table__amount">{formatCurrency(cat.total, currencyCode)}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Monthly summary */}
          {monthly.length > 0 && (
            <div className="card">
              <h3 className="card__title">Monthly Summary</h3>
              <div className="tx-table-wrap">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="tx-table__amount">Income</th>
                      <th className="tx-table__amount">Expenses</th>
                      <th className="tx-table__amount">Capital</th>
                      <th className="tx-table__amount">Withdrawals</th>
                      <th className="tx-table__amount">Net</th>
                      <th className="tx-table__amount">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((row) => (
                      <tr key={row.month}>
                        <td>{formatMonth(row.month)}</td>
                        <td className="tx-table__amount">{formatCurrency(row.income, currencyCode)}</td>
                        <td className="tx-table__amount">{formatCurrency(row.expense, currencyCode)}</td>
                        <td className="tx-table__amount">{formatCurrency(row.capital, currencyCode)}</td>
                        <td className="tx-table__amount">{formatCurrency(row.withdrawal, currencyCode)}</td>
                        <td className={`tx-table__amount ${row.net >= 0 ? 'cf-positive' : 'cf-negative'}`}>
                          {formatCurrency(row.net, currencyCode)}
                        </td>
                        <td className="tx-table__amount">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

export default Reports