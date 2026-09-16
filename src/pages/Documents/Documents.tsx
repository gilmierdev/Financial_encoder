import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import { api, ApiError } from '../../services/api'
import { logToMain } from '../../services/logger'
import type { Category, CategoryType, ParsedDocumentLine, ReadDocumentResult } from '../../../electron/types/ipc'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TYPES: CategoryType[] = ['expense', 'income', 'capital', 'withdrawal', 'asset', 'liability']

function Documents(): React.JSX.Element {
  const [document, setDocument] = useState<ReadDocumentResult | null>(null)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedDocumentLine[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [picking, setPicking] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadCategories = useCallback(async (): Promise<void> => {
    try {
      setCategories(await api.categories.list())
    } catch (err) {
      logToMain('error', 'category list failed', { message: (err as ApiError).message })
    }
  }, [])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  async function pickDocument(): Promise<void> {
    setPicking(true)
    setError(null)
    setSavedCount(null)
    setParsed(null)
    try {
      const doc = await api.ocr.pick()
      setDocument(doc)
      setText(doc.text)
      logToMain('info', 'document read', { fileName: doc.fileName, method: doc.method })
    } catch (err) {
      if (err instanceof ApiError && err.code !== 'OCR_CANCELLED') {
        setError(err.message)
      }
    } finally {
      setPicking(false)
    }
  }

  async function parseText(): Promise<void> {
    if (!document) return
    setParsing(true)
    setError(null)
    try {
      const rows = await api.ocr.parse(text, document.fileName)
      setParsed(rows)
    } catch (err) {
      setError((err as ApiError).message ?? 'The text could not be parsed.')
    } finally {
      setParsing(false)
    }
  }

  function updateRow(order: number, patch: Partial<ParsedDocumentLine>): void {
    setParsed((rows) => rows?.map((row) => (row.order === order ? { ...row, ...patch } : row)) ?? null)
  }

  function removeRow(order: number): void {
    setParsed((rows) => rows?.filter((row) => row.order !== order) ?? null)
  }

  const validRows = useMemo(() => parsed?.filter((row) => row.amount !== null && row.description.trim() !== '') ?? [], [parsed])

  async function saveRows(): Promise<void> {
    if (!parsed) return
    setSaving(true)
    setError(null)
    let created = 0
    try {
      let categoryCache = categories

      for (const row of parsed) {
        if (row.amount === null || row.description.trim() === '') {
          continue
        }
        const type = TYPES.includes(row.type as CategoryType) ? (row.type as CategoryType) : 'expense'

        let category_id: number
        if (row.category.trim()) {
          const existing = categoryCache.find(
            (c) => c.type === type && c.name.toLowerCase() === row.category.trim().toLowerCase(),
          )
          if (existing) {
            category_id = existing.id
          } else {
            const createdCat = await api.categories.create({ name: row.category.trim().slice(0, 60), type })
            categoryCache = [...categoryCache, createdCat]
            category_id = createdCat.id
          }
        } else {
          const fallback = categoryCache.find((c) => c.type === type && c.name.toLowerCase() === 'uncategorized')
          if (fallback) {
            category_id = fallback.id
          } else {
            const createdCat = await api.categories.create({ name: 'Uncategorized', type })
            categoryCache = [...categoryCache, createdCat]
            category_id = createdCat.id
          }
        }

        await api.transactions.create({
          date: row.date || todayIso(),
          description: row.description.replace(/\s+/g, ' ').slice(0, 255),
          category_id,
          type,
          amount: row.amount,
          notes: null,
        })
        created += 1
      }
      setSavedCount(created)
      logToMain('info', 'ocr rows saved', { count: created })
    } catch (err) {
      setError(`Only ${created} of the rows were saved: ${(err as ApiError).message ?? 'unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  function reset(): void {
    setDocument(null)
    setText('')
    setParsed(null)
    setSavedCount(null)
    setError(null)
  }

  return (
    <div className="page">
      <PageHeader
        title="Documents"
        description="Read text from receipts, invoices and statements, then review before saving."
        actions={
          !document ? (
            <button type="button" className="btn btn--primary" onClick={pickDocument} disabled={picking}>
              {picking ? 'Reading…' : 'Select document'}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn--secondary" onClick={pickDocument} disabled={picking}>
                {picking ? 'Reading…' : 'Different document'}
              </button>
              <button type="button" className="btn btn--secondary" onClick={reset}>
                Start over
              </button>
            </>
          )
        }
      />

      {error ? (
        <div role="alert" className="notice notice--error">{error}</div>
      ) : null}

      {savedCount !== null && (
        <div role="status" className="notice notice--ok">
          {savedCount} transaction{savedCount === 1 ? '' : 's'} saved.
        </div>
      )}

      {!document ? (
        <EmptyState
          icon="documents"
          title="No document open"
          description="Open a PDF, or an image such as a receipt, and its text will be read automatically (OCR for images)."
        />
      ) : (
        <>
          <div className="card">
            <h3 className="card__title">
              {document.fileName}
              <span className="doc-badge">{document.method === 'ocr' ? 'OCR' : 'Text'}</span>
            </h3>
            <p className="settings-card-head__desc">
              {document.kind === 'pdf'
                ? document.method === 'ocr'
                  ? 'No embedded text was found, so OCR was used.'
                  : 'Text was extracted from the PDF.'
                : 'Text was read from the image with OCR.'}
              {' '}Edit the text if needed, then parse it.
            </p>
            <textarea
              className="text-input doc-editor"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              spellCheck={false}
              aria-label="Extracted document text"
            />
            <div className="page-actions">
              <button type="button" className="btn btn--primary" onClick={parseText} disabled={parsing || text.trim() === ''}>
                {parsing ? 'Parsing…' : 'Parse transactions'}
              </button>
            </div>
          </div>

          {parsed && (
            <div className="card">
              <h3 className="card__title">
                Parsed rows
                <span className="doc-count">{parsed.length} line{parsed.length === 1 ? '' : 's'}</span>
              </h3>
              <p className="settings-card-head__desc">
                Nothing is saved until you confirm. Adjust dates, descriptions, amounts, types and categories.
              </p>

              {parsed.length === 0 ? (
                <p className="chart-empty">No rows could be parsed from the text.</p>
              ) : (
                <div className="tx-table-wrap doc-table-wrap">
                  <table className="doc-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th className="tx-table__amount">Amount</th>
                        <th>Type</th>
                        <th>Category</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.map((row) => (
                        <tr key={row.order}>
                          <td>
                            <input
                              className="text-input text-input--sm"
                              type="date"
                              value={row.date ?? ''}
                              onChange={(e) => updateRow(row.order, { date: e.target.value || null })}
                              aria-label="Date"
                            />
                          </td>
                          <td>
                            <input
                              className="text-input text-input--sm doc-desc"
                              type="text"
                              value={row.description}
                              onChange={(e) => updateRow(row.order, { description: e.target.value })}
                              aria-label="Description"
                            />
                          </td>
                          <td className="tx-table__amount">
                            <input
                              className="text-input text-input--sm doc-amount"
                              type="number"
                              min={0}
                              step="0.01"
                              value={row.amount ?? ''}
                              onChange={(e) => {
                                const value = Number(e.target.value)
                                updateRow(row.order, { amount: Number.isFinite(value) && value >= 0 ? value : null })
                              }}
                              aria-label="Amount"
                            />
                          </td>
                          <td>
                            <select
                              className="select-input select-input--sm"
                              value={row.type}
                              onChange={(e) => updateRow(row.order, { type: e.target.value })}
                              aria-label="Type"
                            >
                              {TYPES.map((type) => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="text-input text-input--sm"
                              type="text"
                              value={row.category}
                              placeholder="(leave blank to auto-pick)"
                              onChange={(e) => updateRow(row.order, { category: e.target.value })}
                              aria-label="Category"
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn--small btn--danger"
                              onClick={() => removeRow(row.order)}
                              aria-label={`Remove ${row.description}`}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {validRows.length > 0 && (
                <div className="page-actions">
                  <button type="button" className="btn btn--primary" onClick={saveRows} disabled={saving}>
                    {saving ? 'Saving…' : `Save ${validRows.length} transaction${validRows.length === 1 ? '' : 's'}`}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Documents