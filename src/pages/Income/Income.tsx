import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import TypeToConfirmModal from '../../components/ui/TypeToConfirmModal'
import TransactionForm from '../../components/transactions/TransactionForm'
import MonthlyAmountChart from '../../components/charts/MonthlyAmountChart'
import CategoryProgressList from '../../components/ui/CategoryProgressList'
import { Icon } from '../../components/ui/Icon'
import { api, ApiError } from '../../services/api'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
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

const PAGE_SIZE = 20

function Income(): React.JSX.Element {
  const { settings } = useSettings()
  const { success, error: toastError } = useToast()
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
  const [exporting, setExporting] = useState(false)

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
    api.categories.list('income')
      .then((rows) => { if (!cancelled) { setCategories(rows) } })
      .catch((err: unknown) => {
        logToMain('error', 'load income categories failed', { message: (err as ApiError).message })
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
      types: ['income'],
      ...(range.date_from ? { date_from: range.date_from } : {}),
      ...(range.date_to ? { date_to: range.date_to } : {}),
      ...(categoryFilter ? { category_ids: [Number(categoryFilter)] } : {}),
    }

    const txFilters: TransactionFilters = {
      page,
      page_size: PAGE_SIZE,
      sort_by: 'date',
      sort_dir: 'desc',
      type: ['income'],
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
      const message = (err as ApiError).message ?? 'Income data could not be loaded.'
      setError(message)
      logToMain('error', 'load income page failed', { message })
    } finally {
      setLoading(false)
    }
  }, [page, range, categoryFilter, customInvalid])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handleSaved = () => {
      void load()
    }
    window.addEventListener('transaction-saved', handleSaved)
    return () => window.removeEventListener('transaction-saved', handleSaved)
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
      success(`Income transaction "${deleting.description}" deleted.`)
      setDeleting(null)
      await load()
    } catch (err) {
      const message = (err as ApiError).message ?? 'The income transaction could not be deleted.'
      logToMain('error', 'delete income transaction failed', { message })
      toastError(message)
      setError(message)
      setDeleting(null)
    } finally {
      setDeletingBusy(false)
    }
  }

  const handleExportCsv = async (): Promise<void> => {
    setExporting(true)
    try {
      await api.exports.file({
        format: 'csv',
        filter: {
          types: ['income'],
          ...(range.date_from ? { date_from: range.date_from } : {}),
          ...(range.date_to ? { date_to: range.date_to } : {}),
          ...(categoryFilter ? { category_ids: [Number(categoryFilter)] } : {}),
        },
      })
      success('Income ledger exported to CSV!')
    } catch (err) {
      if ((err as ApiError).message !== 'Export cancelled.') {
        toastError((err as ApiError).message ?? 'Export failed.')
      }
    } finally {
      setExporting(false)
    }
  }

  const totalPages = pageData ? Math.max(1, pageData.total_pages) : 1
  const counts = pageData
    ? `${(pageData.page - 1) * pageData.page_size + (pageData.transactions.length > 0 ? 1 : 0)}–${Math.min(pageData.page * pageData.page_size, pageData.total)} of ${pageData.total}`
    : ''

  const monthlyAverage = useMemo(() => {
    const activeMonths = monthly.filter((m) => m.income > 0)
    if (activeMonths.length === 0) return 0
    const sum = activeMonths.reduce((acc, m) => acc + m.income, 0)
    return sum / activeMonths.length
  }, [monthly])

  const topSource = useMemo(() => {
    if (breakdown.length === 0) return null
    return [...breakdown].sort((a, b) => b.total - a.total)[0]
  }, [breakdown])

  return (
    <div className="page income-page">
      <PageHeader
        title="Income"
        description="Track all revenue streams, recurring earnings, and income source breakdown."
        actions={
          <div className="page-header__actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleExportCsv}
              disabled={exporting || !totals || totals.income === 0}
              title="Export income as CSV"
            >
              <Icon name="download" size={15} />
              <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
            </button>
            <button type="button" className="btn btn--primary" onClick={openAdd}>
              <Icon name="plus" size={15} />
              <span>Add Income</span>
            </button>
          </div>
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
            <label className="field__label" htmlFor="income-from">From</label>
            <input
              id="income-from"
              type="date"
              className="text-input text-input--sm"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <label className="field__label" htmlFor="income-to">To</label>
            <input
              id="income-to"
              type="date"
              className="text-input text-input--sm"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        )}

        {categories.length > 0 && (
          <label className="field__label page-cat-filter" htmlFor="income-cat-filter">
            <span className="sr-only">Filter by category</span>
            <select
              id="income-cat-filter"
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

      {/* Modern KPI Cards */}
      {loading && !totals ? (
        <div className="spinner" style={{ margin: '24px auto' }} aria-label="Loading income" />
      ) : totals ? (
        <div className="dash-summary">
          <div className="card stat-card stat-card--income">
            <div className="stat-card__head">
              <span className="stat-card__label">Total Income</span>
              <div className="stat-card__icon" aria-hidden="true">
                <Icon name="arrowUp" size={17} />
              </div>
            </div>
            <span className="stat-card__value stat-card__value--positive">
              {formatCurrency(totals.income, currencyCode)}
            </span>
            <div className="stat-card__footer">
              <span className="stat-card__subtext">Across {totals.count} transactions</span>
            </div>
          </div>

          <div className="card stat-card">
            <div className="stat-card__head">
              <span className="stat-card__label">Monthly Average</span>
              <div className="stat-card__icon" aria-hidden="true">
                <Icon name="calendar" size={17} />
              </div>
            </div>
            <span className="stat-card__value">
              {formatCurrency(monthlyAverage, currencyCode)}
            </span>
            <div className="stat-card__footer">
              <span className="stat-card__subtext">Mean per active month</span>
            </div>
          </div>

          <div className="card stat-card">
            <div className="stat-card__head">
              <span className="stat-card__label">Top Source</span>
              <div className="stat-card__icon" aria-hidden="true">
                <Icon name="tag" size={17} />
              </div>
            </div>
            <span className="stat-card__value" style={{ fontSize: '20px' }}>
              {topSource ? topSource.category_name : '—'}
            </span>
            <div className="stat-card__footer">
              {topSource ? (
                <span className="stat-card__badge stat-card__badge--ok">
                  {formatCurrency(topSource.total, currencyCode)}
                </span>
              ) : (
                <span className="stat-card__subtext">No category data</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Chart + Category Progress List */}
      <div className="page-split">
        <div className="card">
          <h3 className="card__title">Category Distribution</h3>
          <CategoryProgressList
            items={breakdown}
            currencyCode={currencyCode}
            emptyMessage="No income category breakdown available."
            maxItems={8}
          />
        </div>

        <div className="card">
          <h3 className="card__title">Monthly Income History</h3>
          <MonthlyAmountChart data={monthly} kind="income" currencyCode={currencyCode} height={260} />
        </div>
      </div>

      {/* Transactions List */}
      <div className="card">
        <div className="card__head-flex">
          <h3 className="card__title">Income Transactions</h3>
          {pageData && pageData.total > 0 && (
            <span className="field__hint">{counts}</span>
          )}
        </div>

        {loading && !pageData ? (
          <div className="spinner" style={{ margin: '24px auto' }} aria-label="Loading transactions" />
        ) : !pageData || pageData.transactions.length === 0 ? (
          <EmptyState
            icon="income"
            title="No income transactions found"
            description="Start logging your income to track earnings over time."
          >
            <button type="button" className="btn btn--primary" onClick={openAdd}>
              <Icon name="plus" size={15} />
              <span>+ Add Income</span>
            </button>
          </EmptyState>
        ) : (
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="tx-table__amount">Amount</th>
                  <th className="tx-table__actions-head">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageData.transactions.map((tx) => (
                  <tr key={tx.id} className="tx-row">
                    <td className="tx-cell-date">{formatDate(parseISODate(tx.date), dateFormat)}</td>
                    <td className="tx-cell-desc">
                      <span className="tx-table__desc">{tx.description}</span>
                      {tx.notes ? <span className="tx-table__notes">{tx.notes}</span> : null}
                    </td>
                    <td className="tx-cell-cat">
                      <span className="tx-category-tag">
                        <span className="tx-category-dot" aria-hidden="true" />
                        <span>{tx.category_name}</span>
                      </span>
                    </td>
                    <td className="tx-table__amount cf-positive">
                      <span className="tx-amount-badge">
                        +{formatCurrency(tx.amount, currencyCode)}
                      </span>
                    </td>
                    <td className="tx-table__actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm tx-action-btn"
                        onClick={() => openEdit(tx)}
                        title="Edit income"
                      >
                        <Icon name="edit" size={13} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger btn--sm tx-action-btn"
                        onClick={() => setDeleting(tx)}
                        title="Delete income"
                      >
                        <Icon name="trash" size={13} />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="tx-pagination">
              <span className="field__hint">{counts}</span>
              <div className="tx-pagination__controls">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹ Prev
                </button>
                <span className="tx-pagination__page-num">
                  Page {pageData.page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next ›
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <TransactionForm
        open={formOpen}
        defaultType="income"
        transaction={editing}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        onSaved={(saved) => {
          setFormOpen(false)
          setEditing(null)
          setError(null)
          success(editing ? `Updated "${saved.description}"` : `Added "${saved.description}"`)
          void load()
        }}
      />

      <TypeToConfirmModal
        open={deleting !== null}
        title="Delete Income Transaction"
        message={
          <>
            You are about to permanently delete
            {deleting ? <> <strong>"{deleting.description}"</strong> ({formatCurrency(deleting.amount, currencyCode)})</> : ' this income record'}
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

export default Income