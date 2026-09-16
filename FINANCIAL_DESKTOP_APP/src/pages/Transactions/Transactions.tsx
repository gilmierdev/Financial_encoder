import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import TypeToConfirmModal from '../../components/ui/TypeToConfirmModal'
import TransactionForm from '../../components/transactions/TransactionForm'
import { api, ApiError } from '../../services/api'
import { useSettings } from '../../contexts/SettingsContext'
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

function Transactions(): React.JSX.Element {
  const { settings } = useSettings()
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

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 350)
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
      setDeleting(null)
      await load()
    } catch (err) {
      const message = (err as ApiError).message ?? 'The transaction could not be deleted.'
      logToMain('error', 'delete transaction failed', { message })
      setError(message)
      setDeleting(null)
    } finally {
      setDeletingBusy(false)
    }
  }

  const totalPages = data ? Math.max(1, data.total_pages) : 1
  const counts = data
    ? `${(data.page - 1) * data.page_size + (data.transactions.length > 0 ? 1 : 0)}–${Math.min(data.page * data.page_size, data.total)} of ${data.total}`
    : ''

  return (
    <div className="page">
      <PageHeader
        title="Transactions"
        description="Add, edit, search and filter every financial transaction."
        actions={
          <button type="button" className="btn btn--primary" onClick={openAdd}>
            + Add Transaction
          </button>
        }
      />

      <div className="card tx-toolbar">
        <label className="tx-search" htmlFor="tx-search">
          <span className="sr-only">Search transactions</span>
          <input
            id="tx-search"
            type="search"
            className="text-input"
            placeholder="Search description or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="field__label tx-filter" htmlFor="tx-filter-type">
          <span className="sr-only">Filter by type</span>
          <select
            id="tx-filter-type"
            className="select-input"
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          >
            <option value="">All types</option>
            {['income', 'expense', 'capital', 'withdrawal', 'asset', 'liability'].map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </label>
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
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </label>
        {(search || typeFilter || categoryFilter) ? (
          <button type="button" className="btn btn--secondary" onClick={resetFilters}>
            Clear filters
          </button>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="notice notice--error">{error}</div>
      ) : null}

      <div className="card">
        {loading && !data ? (
          <div className="spinner" style={{ margin: '24px auto' }} aria-label="Loading transactions" />
        ) : !data || data.transactions.length === 0 ? (
          <EmptyState
            icon="transactions"
            title="No transactions yet"
            description={
              search || typeFilter || categoryFilter
                ? 'No transactions match your filters.'
                : 'Start by adding your first income or expense.'
            }
          >
            {search || typeFilter || categoryFilter ? (
              <button type="button" className="btn btn--secondary" onClick={resetFilters}>
                Clear filters
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={openAdd}>
                + Add Transaction
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
                {data.transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{formatDate(parseISODate(tx.date), dateFormat)}</td>
                    <td>
                      <span className="tx-table__desc">{tx.description}</span>
                      {tx.notes ? <span className="tx-table__notes">{tx.notes}</span> : null}
                    </td>
                    <td className="tx-table__amount">{formatCurrency(tx.amount, currencyCode)}</td>
                    <td><span className={`badge badge--${tx.type}`}>{tx.type}</span></td>
                    <td>{tx.category_name}</td>
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
              <span className="field__hint">Page {data.page} of {totalPages}</span>
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
        )}
      </div>

      <TransactionForm
        open={formOpen}
        transaction={editing}
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

export default Transactions