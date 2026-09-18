import { useEffect, useMemo, useState } from 'react'
import Modal from '../ui/Modal'
import { api, ApiError } from '../../services/api'
import { toISODate } from '../../utils/dates'
import { logToMain } from '../../services/logger'
import type { Category, Transaction, TransactionInput, TransactionType } from '../../../electron/types/ipc'

const TRANSACTION_TYPES: TransactionType[] = [
  'income',
  'expense',
  'capital',
  'withdrawal',
  'asset',
  'liability',
]

const typeLabel = (t: TransactionType): string =>
  t.charAt(0).toUpperCase() + t.slice(1)

interface TransactionFormProps {
  open: boolean
  transaction: Transaction | null
  onClose: () => void
  onSaved: (transaction: Transaction) => void
  defaultType?: TransactionType
}

interface FormState {
  date: string
  description: string
  category_id: string
  type: TransactionType
  amount: string
  notes: string
}

const emptyForm = (defaultType: TransactionType = 'expense'): FormState => ({
  date: toISODate(new Date()),
  description: '',
  category_id: '',
  type: defaultType,
  amount: '',
  notes: '',
})

function toFormState(transaction: Transaction): FormState {
  return {
    date: transaction.date,
    description: transaction.description,
    category_id: String(transaction.category_id),
    type: transaction.type,
    amount: String(transaction.amount),
    notes: transaction.notes ?? '',
  }
}

function TransactionForm({ open, transaction, onClose, onSaved, defaultType = 'expense' }: TransactionFormProps): React.JSX.Element | null {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setForm(transaction ? toFormState(transaction) : emptyForm(defaultType))
    setError(null)
    let cancelled = false
    setLoadingCategories(true)
    api.categories.list()
      .then((rows) => { if (!cancelled) { setCategories(rows) } })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError((err as ApiError).message ?? 'Categories could not be loaded.')
          logToMain('error', 'load categories failed', { message: (err as ApiError).message })
        }
      })
      .finally(() => { if (!cancelled) { setLoadingCategories(false) } })
    return () => { cancelled = true }
  }, [open, transaction])

  const availableCategories = useMemo(
    () => categories.filter((c) => c.type === form.type),
    [categories, form.type],
  )

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  const changeType = (type: TransactionType): void => {
    const categoryStillValid = availableCategories.some((c) => c.id === Number(form.category_id))
    setForm((prev) => ({
      ...prev,
      type,
      category_id: categoryStillValid ? prev.category_id : '',
    }))
    setError(null)
  }

  const submit = async (): Promise<void> => {
    if (saving) {
      return
    }
    const category_id = Number(form.category_id)
    const amount = Number(form.amount)

    if (!form.date) {
      setError('A date is required.')
      return
    }
    if (!form.description.trim()) {
      setError('A description is required.')
      return
    }
    if (!Number.isInteger(category_id) || category_id <= 0) {
      setError('A category must be selected.')
      return
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Amount must be a non-negative number.')
      return
    }

    const input: TransactionInput = {
      date: form.date,
      description: form.description.trim(),
      category_id,
      type: form.type,
      amount,
      notes: form.notes.trim() ? form.notes.trim() : null,
    }

    setSaving(true)
    setError(null)
    try {
      const saved = transaction
        ? await api.transactions.update(transaction.id, input)
        : await api.transactions.create(input)
      if (saved) {
        onSaved(saved)
      }
    } catch (err) {
      const message = (err as ApiError).message ?? 'The transaction could not be saved.'
      setError(message)
      logToMain('error', 'save transaction failed', { message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={transaction ? 'Edit Transaction' : 'Add Transaction'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            form="tx-form"
            className="btn btn--primary"
            disabled={saving || loadingCategories}
          >
            {saving ? 'Saving…' : transaction ? 'Save changes' : 'Add transaction'}
          </button>
        </>
      }
    >
      {error ? (
        <div role="alert" className="notice notice--error">{error}</div>
      ) : null}

      <form id="tx-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <label className="field" htmlFor="tx-date">
          <span className="field__label">Date</span>
          <input
            id="tx-date"
            type="date"
            className="text-input"
            data-autofocus
            value={form.date}
            onChange={(e) => setField('date', e.target.value)}
          />
        </label>

        <label className="field" htmlFor="tx-description">
          <span className="field__label">Description</span>
          <input
            id="tx-description"
            type="text"
            className="text-input"
            placeholder="e.g. Weekly groceries"
            value={form.description}
            maxLength={255}
            onChange={(e) => setField('description', e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field__label" id="tx-type-label">Type</span>
          <select
            className="select-input"
            aria-labelledby="tx-type-label"
            value={form.type}
            onChange={(e) => changeType(e.target.value as TransactionType)}
          >
            {TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>{typeLabel(t)}</option>
            ))}
          </select>
        </div>

        <label className="field" htmlFor="tx-category">
          <span className="field__label">Category</span>
          <select
            id="tx-category"
            className="select-input"
            value={form.category_id}
            onChange={(e) => setField('category_id', e.target.value)}
            aria-invalid={!loadingCategories && availableCategories.length > 0 && form.category_id === ''}
          >
            {loadingCategories ? (
              <option value="">Loading…</option>
            ) : availableCategories.length === 0 ? (
              <option value="">No {form.type} categories yet</option>
            ) : (
              <>
                <option value="">Select a category</option>
                {availableCategories.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </>
            )}
          </select>
          {!loadingCategories && availableCategories.length === 0 ? (
            <span className="field__hint">
              There are no categories for “{form.type}” yet. Add one in Settings &gt; Categories, or import a document.
            </span>
          ) : null}
        </label>

        <label className="field" htmlFor="tx-amount">
          <span className="field__label">Amount</span>
          <input
            id="tx-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className="text-input"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => setField('amount', e.target.value)}
          />
        </label>

        <label className="field" htmlFor="tx-notes">
          <span className="field__label">Notes</span>
          <textarea
            id="tx-notes"
            className="text-area"
            rows={3}
            maxLength={2000}
            placeholder="Optional notes"
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
          />
        </label>
      </form>
    </Modal>
  )
}

export default TransactionForm