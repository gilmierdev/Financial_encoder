import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import { Icon } from '../../components/ui/Icon'
import { api, ApiError } from '../../services/api'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { formatCurrency } from '../../utils/currency'
import { logToMain } from '../../services/logger'
import type { Category, CategoryType, ParsedDocumentLine, ReadDocumentResult } from '../../../electron/types/ipc'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TYPES: CategoryType[] = ['expense', 'income', 'capital', 'withdrawal', 'asset', 'liability']

function Documents(): React.JSX.Element {
  const { settings } = useSettings()
  const { success, error: toastError } = useToast()
  const currencyCode = settings?.currency ?? 'PHP'

  const [document, setDocument] = useState<ReadDocumentResult | null>(null)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedDocumentLine[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [picking, setPicking] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

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
      success(`Read "${doc.fileName}" via ${doc.method === 'ocr' ? 'OCR' : 'PDF text parser'}`)
      logToMain('info', 'document read', { fileName: doc.fileName, method: doc.method })
    } catch (err) {
      if (err instanceof ApiError && err.code !== 'OCR_CANCELLED') {
        setError(err.message)
        toastError(err.message)
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
      success(`Extracted ${rows.length} transaction candidates!`)
    } catch (err) {
      const msg = (err as ApiError).message ?? 'The text could not be parsed.'
      setError(msg)
      toastError(msg)
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

  function setAllTypes(type: CategoryType): void {
    setParsed((rows) => rows?.map((r) => ({ ...r, type })) ?? null)
  }

  const validRows = useMemo(() => parsed?.filter((row) => row.amount !== null && row.description.trim() !== '') ?? [], [parsed])

  const totalSum = useMemo(() => {
    return validRows.reduce((acc, r) => acc + (r.amount ?? 0), 0)
  }, [validRows])

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

        const saved = await api.transactions.create({
          date: row.date || todayIso(),
          description: row.description.replace(/\s+/g, ' ').slice(0, 255),
          category_id,
          type,
          amount: row.amount,
          notes: `Imported from OCR document: ${document?.fileName ?? 'receipt'}`,
        })
        created += 1
        window.dispatchEvent(new CustomEvent('transaction-saved', { detail: saved }))
      }
      setSavedCount(created)
      success(`Successfully saved ${created} transaction${created === 1 ? '' : 's'}!`)
      logToMain('info', 'ocr rows saved', { count: created })
    } catch (err) {
      const msg = `Only ${created} of the rows were saved: ${(err as ApiError).message ?? 'unknown error'}`
      setError(msg)
      toastError(msg)
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
    <div className="page documents-page">
      <PageHeader
        title="Documents &amp; OCR"
        description="Extract transactions automatically from scanned receipts, invoices, bills, and PDF bank statements."
        actions={
          !document ? (
            <button type="button" className="btn btn--primary" onClick={pickDocument} disabled={picking}>
              <Icon name="receipt" size={15} />
              <span>{picking ? 'Scanning…' : 'Select Document'}</span>
            </button>
          ) : (
            <div className="page-header__actions">
              <button type="button" className="btn btn--secondary" onClick={pickDocument} disabled={picking}>
                <span>Different Document</span>
              </button>
              <button type="button" className="btn btn--secondary" onClick={reset}>
                <span>Reset</span>
              </button>
            </div>
          )
        }
      />

      {error ? (
        <div role="alert" className="notice notice--error">{error}</div>
      ) : null}

      {savedCount !== null && (
        <div role="status" className="notice notice--ok">
          <div className="notice-flex">
            <span><strong>{savedCount}</strong> transaction{savedCount === 1 ? '' : 's'} successfully saved to your ledger.</span>
            <Link to="/transactions" className="btn btn--secondary btn--sm">
              View in Ledger →
            </Link>
          </div>
        </div>
      )}

      {!document ? (
        <div
          className={`dropzone card${isDragging ? ' dropzone--active' : ''}`}
          onClick={pickDocument}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            void pickDocument()
          }}
          role="button"
          tabIndex={0}
          aria-label="Upload document dropzone"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void pickDocument() }}
        >
          <div className="dropzone__icon">
            <Icon name="receipt" size={32} />
          </div>
          <h3 className="dropzone__title">
            {picking ? 'Reading & Extracting Document…' : 'Upload Receipt or Invoice'}
          </h3>
          <p className="dropzone__desc">
            Click anywhere or drop your file here to scan receipts, invoices, or bank statements with intelligent OCR.
          </p>
          <div className="dropzone__types">
            <span className="dropzone__type-pill">PDF</span>
            <span className="dropzone__type-pill">PNG</span>
            <span className="dropzone__type-pill">JPG</span>
            <span className="dropzone__type-pill">JPEG</span>
            <span className="dropzone__type-pill">TIFF</span>
          </div>
          <button
            type="button"
            className="btn btn--primary dropzone__btn"
            onClick={(e) => { e.stopPropagation(); void pickDocument() }}
            disabled={picking}
          >
            <Icon name="search" size={15} />
            <span>{picking ? 'Processing Document…' : 'Browse Files'}</span>
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card__head-flex">
              <div>
                <h3 className="card__title">
                  {document.fileName}
                  <span className="doc-badge">{document.method === 'ocr' ? 'OCR Engine' : 'Digital PDF'}</span>
                </h3>
                <p className="card__subtitle">
                  {document.kind === 'pdf'
                    ? document.method === 'ocr'
                      ? 'No native text detected; optical character recognition (OCR) was applied.'
                      : 'Text extracted directly from document structure.'
                    : 'Scanned image read via local Tesseract OCR engine.'}
                  {' '}Review extracted raw text below, then click Parse.
                </p>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={parseText}
                disabled={parsing || text.trim() === ''}
              >
                <Icon name="sparkles" size={15} />
                <span>{parsing ? 'Parsing Transactions…' : 'Parse Transactions'}</span>
              </button>
            </div>

            <textarea
              className="text-input doc-editor"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              spellCheck={false}
              aria-label="Extracted document text"
            />
          </div>

          {parsed && (
            <div className="card">
              <div className="card__head-flex">
                <div>
                  <h3 className="card__title">
                    Extracted Transaction Items
                    <span className="doc-count">{parsed.length} row{parsed.length === 1 ? '' : 's'}</span>
                  </h3>
                  <p className="card__subtitle">
                    Verify dates, descriptions, amounts, and categories before committing to your database.
                  </p>
                </div>

                {validRows.length > 0 && (
                  <div className="doc-summary-badge">
                    <span className="doc-summary-label">Total to Save:</span>
                    <span className="doc-summary-val">{formatCurrency(totalSum, currencyCode)}</span>
                  </div>
                )}
              </div>

              {/* Quick row modifiers */}
              {parsed.length > 0 && (
                <div className="doc-quick-toolbar">
                  <span className="field__hint">Bulk type assignment:</span>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAllTypes('expense')}>
                    All Expenses
                  </button>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAllTypes('income')}>
                    All Income
                  </button>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAllTypes('capital')}>
                    All Capital
                  </button>
                </div>
              )}

              {parsed.length === 0 ? (
                <p className="chart-empty">No transaction rows could be parsed. You can edit the text above and try parsing again.</p>
              ) : (
                <div className="tx-table-wrap doc-table-wrap">
                  <table className="doc-table">
                    <thead>
                      <tr>
                        <th style={{ width: '130px' }}>Date</th>
                        <th>Description</th>
                        <th style={{ width: '130px' }}>Amount</th>
                        <th style={{ width: '120px' }}>Type</th>
                        <th style={{ width: '160px' }}>Category</th>
                        <th style={{ width: '60px', textAlign: 'center' }}>Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.map((row) => (
                        <tr key={row.order} className="doc-row">
                          <td>
                            <input
                              type="date"
                              className="text-input text-input--sm"
                              value={row.date ?? ''}
                              onChange={(e) => updateRow(row.order, { date: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="text-input"
                              style={{ width: '100%' }}
                              value={row.description}
                              onChange={(e) => updateRow(row.order, { description: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              className="text-input text-input--sm doc-amount-input"
                              placeholder="0.00"
                              value={row.amount === null ? '' : row.amount}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : Number(e.target.value)
                                updateRow(row.order, { amount: val })
                              }}
                            />
                          </td>
                          <td>
                            <select
                              className="select-input select-input--sm"
                              value={row.type}
                              onChange={(e) => updateRow(row.order, { type: e.target.value as CategoryType })}
                            >
                              {TYPES.map((t) => (
                                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="text-input text-input--sm"
                              style={{ width: '100%' }}
                              placeholder="Category name"
                              value={row.category}
                              onChange={(e) => updateRow(row.order, { category: e.target.value })}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              onClick={() => removeRow(row.order)}
                              title="Remove item"
                            >
                              <Icon name="x" size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="doc-save-footer">
                <span className="field__hint">
                  {validRows.length} of {parsed.length} items ready to save.
                </span>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={saveRows}
                  disabled={saving || validRows.length === 0}
                >
                  <Icon name="check" size={15} />
                  <span>{saving ? 'Saving to Database…' : `Confirm & Save ${validRows.length} Transactions`}</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Documents