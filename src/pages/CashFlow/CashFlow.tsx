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
  MonthlySummary,
} from '../../../electron/types/ipc'

function CashFlow(): React.JSX.Element {
  const { settings } = useSettings()
  const currencyCode = settings?.currency ?? 'PHP'

  const [period, setPeriod] = useState<PeriodKey>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [totals, setTotals] = useState<CalculationTotals | null>(null)
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
      const [totalsResult, monthlyResult] = await Promise.all([
        api.calculations.totals(calcFilter),
        api.calculations.monthly(calcFilter),
      ])
      setTotals(totalsResult)
      setMonthly(monthlyResult)
    } catch (err) {
      const message = (err as ApiError).message ?? 'Cash flow data could not be loaded.'
      setError(message)
      logToMain('error', 'load cash flow page failed', { message })
    } finally {
      setLoading(false)
    }
  }, [range, customInvalid])

  useEffect(() => {
    void load()
  }, [load])

  const inflows = totals ? totals.income + totals.capital : 0
  const outflows = totals ? totals.expense + totals.withdrawal : 0
  const netCash = inflows - outflows

  const chartData = useMemo(
    () => monthlyToCashFlowChartData(monthly, true),
    [monthly],
  )

  return (
    <div className="page">
      <PageHeader
        title="Cash Flow"
        description="Monitor money coming in, going out, and net flow over time."
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
            <label className="field__label" htmlFor="cf-from">
              From
            </label>
            <input
              id="cf-from"
              type="date"
              className="text-input text-input--sm"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <label className="field__label" htmlFor="cf-to">
              To
            </label>
            <input
              id="cf-to"
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

      {/* Summary cards */}
      {loading && !totals ? (
        <div className="spinner" style={{ margin: '24px auto' }} aria-label="Loading cash flow" />
      ) : totals ? (
        <div className="page-summary">
          <div className="card page-summary__card">
            <span className="page-summary__label">Total Inflows</span>
            <span className="page-summary__value page-summary__value--positive">
              {formatCurrency(inflows, currencyCode)}
            </span>
          </div>
          <div className="card page-summary__card">
            <span className="page-summary__label">Total Outflows</span>
            <span className="page-summary__value page-summary__value--negative">
              {formatCurrency(outflows, currencyCode)}
            </span>
          </div>
          <div className="card page-summary__card">
            <span className="page-summary__label">Net Cash Flow</span>
            <span className={`page-summary__value ${netCash >= 0 ? 'page-summary__value--positive' : 'page-summary__value--negative'}`}>
              {formatCurrency(netCash, currencyCode)}
            </span>
          </div>
          <div className="card page-summary__card">
            <span className="page-summary__label">Transactions</span>
            <span className="page-summary__value">
              {totals.count.toLocaleString()}
            </span>
          </div>
        </div>
      ) : null}

      {/* Monthly cash flow */}
      {!loading && monthly.length === 0 ? (
        <EmptyState
          icon="cashflow"
          title="No cash flow data"
          description={period !== 'all' ? 'No transactions match the selected period.' : 'Record some transactions to see cash flow breakdowns.'}
        >
          {period !== 'all' && (
            <button type="button" className="btn btn--secondary" onClick={() => setPeriod('all')}>
              Show all
            </button>
          )}
        </EmptyState>
      ) : monthly.length > 0 ? (
        <>
          <div className="card page-cf">
            <h3 className="card__title">Cash Flow Chart</h3>
            <CashFlowChart
              data={chartData}
              currencyCode={currencyCode}
              height={300}
              labels={{ inflow: 'Inflows', outflow: 'Outflows', net: 'Net Cash Flow' }}
            />
          </div>

          <div className="card page-cf">
            <h3 className="card__title">Monthly Cash Flow</h3>
            <div className="tx-table-wrap">
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="tx-table__amount">Inflows</th>
                    <th className="tx-table__amount">Outflows</th>
                    <th className="tx-table__amount">Net Flow</th>
                    <th className="tx-table__amount">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((row) => {
                    const inflow = row.income + row.capital
                    const outflow = row.expense + row.withdrawal
                    const net = inflow - outflow
                    return (
                      <tr key={row.month}>
                        <td>{formatMonth(row.month)}</td>
                        <td className="tx-table__amount">{formatCurrency(inflow, currencyCode)}</td>
                        <td className="tx-table__amount">{formatCurrency(outflow, currencyCode)}</td>
                        <td className={`tx-table__amount ${net >= 0 ? 'cf-positive' : 'cf-negative'}`}>
                          {formatCurrency(net, currencyCode)}
                        </td>
                        <td className="tx-table__amount">{row.count}</td>
                      </tr>
                    )
                  })}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr className="ib-table__total">
                      <td><strong>Total</strong></td>
                      <td className="tx-table__amount"><strong>{formatCurrency(inflows, currencyCode)}</strong></td>
                      <td className="tx-table__amount"><strong>{formatCurrency(outflows, currencyCode)}</strong></td>
                      <td className={`tx-table__amount ${netCash >= 0 ? 'cf-positive' : 'cf-negative'}`}>
                        <strong>{formatCurrency(netCash, currencyCode)}</strong>
                      </td>
                      <td className="tx-table__amount"><strong>{totals.count}</strong></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default CashFlow