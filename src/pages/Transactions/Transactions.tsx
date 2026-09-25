import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import TypeToConfirmModal from '../../components/ui/TypeToConfirmModal'
import TransactionForm from '../../components/transactions/TransactionForm'
import { Icon } from '../../components/ui/Icon'
import { api, ApiError } from '../../services/api'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate, parseISODate } from '../../utils/dates'
import { logToMain } from '../../services/logger'
import type { Category, Transaction, TransactionFilters, TransactionPage, TransactionType } from '../../../electron/types/ipc'

const PAGE_SIZE = 20
type TransactionFilterType = TransactionType

interface SortState {
  sort_by: NonNullable<TransactionFilters['sort_by']>
  sort_dir: 'asc' | 'desc'
}

const TYPE_FILTER_TABS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Transactions' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expenses' },
  { value: 'capital', label: 'Capital' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
]

function Transactions(): React.JSX.Element {
  const { settings } = useSettings()
  const { success, error: toastError } = useToast()
  const [searchParams] = useSearchParams()
  const currencyCode = settings?.currency ?? 'PHP'
  const dateFormat = settings?.dateFormat ?? 'YYYY-MM-DD'

  const [data, setData] = useState<TransactionPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ sort_by: 'date', sort_dir: 'desc' })

  const [categories, setCategories] = useState<Category[]>([])
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.categories.list()
      .then((rows) => { if (!cancelled) { setCategories(rows) } })
      .catch((err: unknown) => {
        logToMain('error', 'load categories failed', { message: (err as ApiError).message })
      })
    return () => { cancelled = true }
  }, [])

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const filters: TransactionFilters = {
      page,
      page_size: PAGE_SIZE,
      sort_by: sort.sort_by,
      sort_dir: sort.sort_dir,
    }
    if (debouncedSearch.trim()) {
      filters.search_term = debouncedSearch.trim()
    }
    if (typeFilter) {
      filters.type = [typeFilter as TransactionFilterType]
    }
    if (categoryFilter) {
      filters.category_id = [Number(categoryFilter)]
    }
    try {
      const result = await api.transactions.list(filters)
      setData(result)
    } catch (err) {
      const message = (err as ApiError).message ?? 'Transactions could not be loaded.'
      setError(message)
      logToMain('error', 'load transactions failed', { message })
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, sort, typeFilter, categoryFilter])

  useEffect(() => {
    void load()
  }, [load])

  // Auto-refresh when transaction-saved event is dispatched
  useEffect(() => {
    const handleSaved = () => {
      void load()
    }
    window.addEventListener('transaction-saved', handleSaved)
    return () => window.removeEventListener('transaction-saved', handleSaved)
  }, [load])

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(handle)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) {
      setSearch(q)
      setPage(1)
    }
  }, [searchParams])

  const toggleSort = (by: NonNullable<TransactionFilters['sort_by']>): void => {
    setPage(1)
    setSort((prev) => (prev.sort_by === by
      ? { sort_by: by, sort_dir: prev.sort_dir === 'asc' ? 'desc' : 'asc' }
      : { sort_by: by, sort_dir: 'asc' }))
  }

  const sortArrow = (by: NonNullable<TransactionFilters['sort_by']>): string => {
    if (sort.sort_by !== by) {
      return ''
    }
    return sort.sort_dir === 'asc' ? ' ↑' : ' ↓'
  }

  const resetFilters = (): void => {
    setSearch('')
    setTypeFilter('')
    setCategoryFilter('')
    setPage(1)
  }

  const openAdd = (): void => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (transaction: Transaction): void => {
    setEditing(transaction)
    setFormOpen(true)
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleting || deletingBusy) {
      return
    }
    setDeletingBusy(true)
    try {
      await api.transactions.delete(deleting.id)
      success(`Transaction "${deleting.description}" deleted.`)
      setDeleting(null)
      await load()
    } catch (err) {
      const message = (err as ApiError).message ?? 'The transaction could not be deleted.'
      logToMain('error', 'delete transaction failed', { message })
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
          ...(typeFilter ? { types: [typeFilter as TransactionType] } : {}),
          ...(categoryFilter ? { category_ids: [Number(categoryFilter)] } : {}),
        },
      })
      success('Transactions exported to CSV!')
    } catch (err) {
      if ((err as ApiError).message !== 'Export cancelled.') {
        toastError((err as ApiError).message ?? 'Export failed.')
      }
    } finally {
      setExporting(false)
    }
  }

  const totalPages = data ? Math.max(1, data.total_pages) : 1
  const counts = data
    ? `${(data.page - 1) * data.page_size + (data.transactions.length > 0 ? 1 : 0)}–${Math.min(data.page * data.page_size, data.total)} of ${data.total}`
    : ''

  return (
    <div className="page transactions-page">
      <PageHeader
        title="Transactions"
        description="Comprehensive ledger. Search, filter, inspect, and manage every financial record."
        actions={
          <div className="tx-header-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleExportCsv}
              disabled={exporting || !data || data.total === 0}
              title="Export current view as CSV"
            >
              <Icon name="download" size={15} />
              <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={openAdd}
              title="Add new transaction (Press N)"
            >
              <Icon name="plus" size={15} />
              <span>Add Transaction</span>
            </button>
          </div>
        }
      />

      {/* Quick Filter Tabs */}
      <div className="tx-tabs" role="tablist" aria-label="Transaction type filter">
        {TYPE_FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`tx-tab${typeFilter === tab.value ? ' tx-tab--active' : ''}`}
            role="tab"
            aria-selected={typeFilter === tab.value}
            onClick={() => {
              setTypeFilter(tab.value)
              setPage(1)
            }}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="card tx-toolbar">
        <div className="tx-search">
          <Icon name="search" size={16} />
          <input
            id="tx-search"
            type="search"
            className="text-input"
            placeholder="Search description, category, or notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="tx-search__clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>

        <label className="field__label tx-filter" htmlFor="tx-filter-category">
          <span className="sr-only">Filter by category</span>
          <select
            id="tx-filter-category"
            className="select-input"
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name} ({c.type})</option>
            ))}
          </select>
        </label>

        {(search || typeFilter || categoryFilter) ? (
          <button type="button" className="btn btn--secondary btn--sm" onClick={resetFilters}>
            <Icon name="x" size={13} />
            <span>Reset filters</span>
          </button>
        ) : null}

        {data && (
          <div className="tx-count-tag">
            <span>{data.total.toLocaleString()} {data.total === 1 ? 'record' : 'records'}</span>
          </div>
        )}
      </div>

      {error ? (
        <div role="alert" className="notice notice--error">{error}</div>
      ) : null}

      <div className="card tx-card-container">
        {loading && !data ? (
          <div className="spinner" style={{ margin: '36px auto' }} aria-label="Loading transactions" />
        ) : !data || data.transactions.length === 0 ? (
          <EmptyState
            icon="transactions"
            title={search || typeFilter || categoryFilter ? 'No matching transactions' : 'No transactions recorded'}
            description={
              search || typeFilter || categoryFilter
                ? 'Try broadening your search term or selecting a different filter.'
                : 'Get started by creating your first transaction, or import your records.'
            }
          >
            {search || typeFilter || categoryFilter ? (
              <button type="button" className="btn btn--secondary" onClick={resetFilters}>
                Clear active filters
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={openAdd}>
                <Icon name="plus" size={15} />
                <span>+ Add Transaction</span>
              </button>
            )}
          </EmptyState>
        ) : (
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  {(['date', 'description', 'amount', 'type'] as const).map((col) => (
                    <th key={col}>
                      <button type="button" className="tx-table__sort" onClick={() => toggleSort(col)}>
                        {col.charAt(0).toUpperCase() + col.slice(1)}{sortArrow(col)}
                      </button>
                    </th>
                  ))}
                  <th>Category</th>
                  <th className="tx-table__actions-head">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => {
                  const isOutflow = tx.type === 'expense' || tx.type === 'withdrawal'
                  return (
                    <tr key={tx.id} className="tx-row">
                      <td className="tx-cell-date">
                        <time dateTime={tx.date}>{formatDate(parseISODate(tx.date), dateFormat)}</time>
                      </td>
                      <td className="tx-cell-desc">
                        <span className="tx-table__desc">{tx.description}</span>
                        {tx.notes ? <span className="tx-table__notes">{tx.notes}</span> : null}
                      </td>
                      <td className={`tx-table__amount ${isOutflow ? 'cf-negative' : 'cf-positive'}`}>
                        <span className="tx-amount-badge">
                          {isOutflow ? '-' : '+'}{formatCurrency(tx.amount, currencyCode)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge--${tx.type}`}>{tx.type}</span>
                      </td>
                      <td className="tx-cell-cat">
                        <span className="tx-category-tag">
                          <span className="tx-category-dot" aria-hidden="true" />
                          <span>{tx.category_name}</span>
                        </span>
                      </td>
                      <td className="tx-table__actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm tx-action-btn"
                          onClick={() => openEdit(tx)}
                          title="Edit transaction"
                        >
                          <Icon name="edit" size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm tx-action-btn"
                          onClick={() => setDeleting(tx)}
                          title="Delete transaction"
                        >
                          <Icon name="trash" size={13} />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
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
                  Page {data.page} of {totalPages}
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
        title="Delete Transaction"
        message={
          <>
            You are about to permanently delete
            {deleting ? <> <strong>"{deleting.description}"</strong> ({formatCurrency(deleting.amount, currencyCode)})</> : ' the transaction'}
            . This cannot be undone.
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

export default Transactions