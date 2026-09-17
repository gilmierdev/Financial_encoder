import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import TypeToConfirmModal from '../../components/ui/TypeToConfirmModal'
import TransactionForm from '../../components/transactions/TransactionForm'
import MonthlyAmountChart from '../../components/charts/MonthlyAmountChart'
import { api, ApiError } from '../../services/api'
import { useSettings } from '../../contexts/SettingsContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate, parseISODate } from '../../utils/dates'
import {
  customRangeInvalid,
  PERIOD_KEYS,
  PERIOD_LABELS,
  periodRange,
  type PeriodKey,
} from '../../utils/periods'
import { logToMain } from '../../services/logger'
import type {
  CalculationFilter,
  Category,
  CalculationTotals,
  CategoryBreakdown,
  MonthlySummary,
  Transaction,
  TransactionFilters,
  TransactionPage,
} from '../../../electron/types/ipc'

const CAPITAL_TYPES = ['capital', 'withdrawal'] as const
const PAGE_SIZE = 20

function Capital(): React.JSX.Element {
  const { settings } = useSettings()
  const currencyCode = settings?.currency ?? 'PHP'
  const dateFormat = settings?.dateFormat ?? 'YYYY-MM-DD'

  const [period, setPeriod] = useState<PeriodKey>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [totals, setTotals] = useState<CalculationTotals | null>(null)
  const [breakdown, setBreakdown] = useState<CategoryBreakdown[]>([])
  const [monthly, setMonthly] = useState<MonthlySummary[]>([])
  const [pageData, setPageData] = useState<TransactionPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)

  const [categories, setCategories] = useState<Category[]>([])
  const [categoryFilter, setCategoryFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const range = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo])
  const customInvalid = customRangeInvalid(customFrom, customTo)

  useEffect(() => {
    let cancelled = false
    api.categories.list()
      .then((rows) => {
        if (!cancelled) {
          setCategories(rows.filter((c) => c.type === 'capital' || c.type === 'withdrawal'))
        }
      })
      .catch((err: unknown) => {
        logToMain('error', 'load capital categories failed', { message: (err as ApiError).message })
      })
    return () => { cancelled = true }
  }, [])

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    if (customInvalid) {
      setLoading(false)
      return
    }

    const calcFilter: CalculationFilter = {
      types: [...CAPITAL_TYPES],
      ...(range.date_from ? { date_from: range.date_from } : {}),
      ...(range.date_to ? { date_to: range.date_to } : {}),
      ...(categoryFilter ? { category_ids: [Number(categoryFilter)] } : {}),
    }

    const txFilters: TransactionFilters = {
      page,
      page_size: PAGE_SIZE,
      sort_by: 'date',
      sort_dir: 'desc',
      type: [...CAPITAL_TYPES],
      ...(range.date_from ? { date_from: range.date_from } : {}),
      ...(range.date_to ? { date_to: range.date_to } : {}),
      ...(categoryFilter ? { category_id: [Number(categoryFilter)] } : {}),
    }

    try {
      const [totalsResult, breakdownResult, monthlyResult, txResult] = await Promise.all([
        api.calculations.totals(calcFilter),
        api.calculations.byCategory(calcFilter),
        api.calculations.monthly(calcFilter),
        api.transactions.list(txFilters),
      ])
      setTotals(totalsResult)
      setBreakdown(breakdownResult)
      setMonthly(monthlyResult)
      setPageData(txResult)
    } catch (err) {
      const message = (err as ApiError).message ?? 'Capital data could not be loaded.'
      setError(message)
      logToMain('error', 'load capital page failed', { message })
    } finally {
      setLoading(false)
    }
  }, [page, range, categoryFilter, customInvalid])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [period, customFrom, customTo, categoryFilter])

  const openAdd = (): void => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (tx: Transaction): void => {
    setEditing(tx)
    setFormOpen(true)
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleting || deletingBusy) {
      return
    }
    setDeletingBusy(true)
    try {
      await api.transactions.delete(deleting.id)
      setDeleting(null)
      await load()
    } catch (err) {
      const message = (err as ApiError).message ?? 'The transaction could not be deleted.'
      logToMain('error', 'delete capital transaction failed', { message })
      setError(message)
      setDeleting(null)
    } finally {
      setDeletingBusy(false)
    }
  }

  const totalPages = pageData ? Math.max(1, pageData.total_pages) : 1
  const counts = pageData
    ? `${(pageData.page - 1) * pageData.page_size + (pageData.transactions.length > 0 ? 1 : 0)}–${Math.min(pageData.page * pageData.page_size, pageData.total)} of ${pageData.total}`
    : ''

  return (
    <div className="page">
      <PageHeader
        title="Capital"
        description="Track owner investments, withdrawals and net capital position."
        actions={
          <button type="button" className="btn btn--primary" onClick={openAdd}>
            + Add Transaction
          </button>
        }
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
            <label className="field__label" htmlFor="capital-from">
              From
            </label>
            <input
              id="capital-from"
              type="date"
              className="text-input text-input--sm"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <label className="field__label" htmlFor="capital-to">
              To
            </label>
            <input
              id="capital-to"
              type="date"
              className="text-input text-input--sm"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        )}

        {categories.length > 0 && (
          <label className="field__label page-cat-filter" htmlFor="capital-cat-filter">
            <span className="sr-only">Filter by category</span>
            <select
              id="capital-cat-filter"
              className="select-input"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          </label>
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
        <div className="spinner" style={{ margin: '24px auto' }} aria-label="Loading capital" />
      ) : totals ? (
        <div className="page-summary">
          <div className="card page-summary__card">
            <span className="page-summary__label">Total Capital</span>
            <span className="page-summary__value page-summary__value--positive">
              {formatCurrency(totals.capital, currencyCode)}
            </span>
          </div>
          <div className="card page-summary__card">
            <span className="page-summary__label">Total Withdrawals</span>
            <span className="page-summary__value page-summary__value--negative">
              {formatCurrency(totals.withdrawal, currencyCode)}
            </span>
          </div>
          <div className="card page-summary__card">
            <span className="page-summary__label">Net Position</span>
            <span className={`page-summary__value ${totals.net >= 0 ? 'page-summary__value--positive' : 'page-summary__value--negative'}`}>
              {formatCurrency(totals.net, currencyCode)}
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

      {/* Monthly trend charts */}
      {!loading && monthly.length > 0 && (
        <div className="page-cats">
          <div className="card">
            <h3 className="card__title">Capital Trend</h3>
            <MonthlyAmountChart data={monthly} kind="capital" currencyCode={currencyCode} height={220} />
          </div>
          <div className="card">
            <h3 className="card__title">Withdrawal Trend</h3>
            <MonthlyAmountChart data={monthly} kind="withdrawal" currencyCode={currencyCode} height={220} />
          </div>
        </div>
      )}

      {/* Category breakdown + Transaction list */}
      {!loading && totals && totals.count === 0 && breakdown.length === 0 ? (
        <EmptyState
          icon="capital"
          title="No capital transactions"
          description={period !== 'all' || categoryFilter ? 'No capital transactions match the selected filters.' : 'Record your first owner investment or withdrawal.'}
        >
          {period !== 'all' || categoryFilter ? (
            <button type="button" className="btn btn--secondary" onClick={() => { setPeriod('all'); setCategoryFilter('') }}>
              Show all
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={openAdd}>
              + Add Transaction
            </button>
          )}
        </EmptyState>
      ) : breakdown.length > 0 || (pageData && pageData.transactions.length > 0) ? (
        <div className="page-split">
          {/* Category breakdown */}
          {breakdown.length > 0 && (
            <div className="card page-breakdown">
              <h3 className="card__title">By Category</h3>
              <table className="ib-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="ib-table__right">Total</th>
                    <th className="ib-table__right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((cat) => (
                    <tr key={cat.category_id}>
                      <td>
                        {cat.category_name}
                        <span className={`badge badge--${cat.type}`} style={{ marginLeft: 6 }}>
                          {cat.type}
                        </span>
                      </td>
                      <td className="ib-table__right">{formatCurrency(cat.total, currencyCode)}</td>
                      <td className="ib-table__right">{cat.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Transaction table */}
          {pageData && pageData.transactions.length > 0 && (
            <div className="card page-transactions">
              <h3 className="card__title">Transactions</h3>
              <div className="tx-table-wrap">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Type</th>
                      <th className="tx-table__amount">Amount</th>
                      <th className="tx-table__actions-head">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{formatDate(parseISODate(tx.date), dateFormat)}</td>
                        <td>
                          <span className="tx-table__desc">{tx.description}</span>
                          {tx.notes ? <span className="tx-table__notes">{tx.notes}</span> : null}
                        </td>
                        <td>{tx.category_name}</td>
                        <td><span className={`badge badge--${tx.type}`}>{tx.type}</span></td>
                        <td className="tx-table__amount">{formatCurrency(tx.amount, currencyCode)}</td>
                        <td className="tx-table__actions">
                          <button type="button" className="btn btn--secondary btn--sm" onClick={() => openEdit(tx)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleting(tx)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pageData.total_pages > 1 && (
                <div className="tx-pagination">
                  <span className="field__hint">{counts}</span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ‹ Prev
                  </button>
                  <span className="field__hint">Page {pageData.page} of {totalPages}</span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next ›
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      <TransactionForm
        open={formOpen}
        transaction={editing}
        defaultType="capital"
        onClose={() => { setFormOpen(false); setEditing(null) }}
        onSaved={() => {
          setFormOpen(false)
          setEditing(null)
          setError(null)
          void load()
        }}
      />

      <TypeToConfirmModal
        open={deleting !== null}
        title="Delete Transaction"
        message={
          <>
            You are about to permanently delete
            {deleting ? <> <strong>"{deleting.description}"</strong> ({formatCurrency(deleting.amount, currencyCode)})</> : ' the transaction'}
            .
          </>
        }
        confirmLabel="Delete Permanently"
        requiredText="DELETE"
        busy={deletingBusy}
        busyLabel="Deleting…"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

export default Capital