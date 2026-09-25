import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import { Icon } from '../../components/ui/Icon'
import { api, ApiError } from '../../services/api'
import { useToast } from '../../contexts/ToastContext'
import { logToMain } from '../../services/logger'
import type { ImportField, ImportPreview, ImportResult } from '../../../electron/types/ipc'

const IMPORT_FIELDS: readonly ImportField[] = ['date', 'description', 'amount', 'type', 'category', 'notes']

const FIELD_LABELS: Record<ImportField, string> = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
  type: 'Type',
  category: 'Category',
  notes: 'Notes',
}

const REQUIRED_FIELDS: ImportField[] = ['date', 'description', 'amount']

function normalized(mapping: Record<ImportField, number>, fallback: number): Record<ImportField, number> {
  const out = { ...mapping }
  for (const field of IMPORT_FIELDS) {
    if (!Number.isInteger(out[field]) || out[field] < -1) {
      out[field] = fallback
    }
  }
  return out
}

function Import(): React.JSX.Element {
  const { success, error: toastError } = useToast()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<Record<ImportField, number> | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [picking, setPicking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const displayColumns = useMemo(() => {
    if (!preview) return []
    if (preview.columns.length > 0) {
      return preview.columns
    }
    const width = preview.sampleRows.reduce((max, r) => Math.max(max, r.length), 0)
    return Array.from({ length: width }, (_, i) => String.fromCharCode(65 + i))
  }, [preview])

  async function pickFile(): Promise<void> {
    setPicking(true)
    setError(null)
    setResult(null)
    try {
      const picked = await api.imports.pick()
      setPreview(picked)
      setMapping(normalized(picked.suggested, 0))
      success(`Loaded "${picked.fileName}" with ${picked.totalRows.toLocaleString()} rows.`)
    } catch (err) {
      if (err instanceof ApiError && err.code !== 'IMPORT_CANCELLED') {
        setError(err.message)
        toastError(err.message)
      } else if (!(err instanceof ApiError)) {
        setError('The file could not be opened.')
        toastError('The file could not be opened.')
      }
    } finally {
      setPicking(false)
    }
  }

  function setField(field: ImportField, index: number): void {
    if (!mapping) return
    setMapping({ ...mapping, [field]: index })
  }

  const canImport = mapping
    && preview !== null
    && preview.totalRows > 0
    && REQUIRED_FIELDS.every((field) => mapping[field] >= 0)
    && !importing

  const missingRequired = mapping
    ? REQUIRED_FIELDS.filter((field) => mapping[field] < 0)
    : REQUIRED_FIELDS

  async function runImport(): Promise<void> {
    if (!preview || !mapping) return
    setImporting(true)
    setError(null)
    try {
      const done = await api.imports.confirm({ filePath: preview.filePath, mapping })
      setResult(done)
      success(`Successfully imported ${done.imported} transactions!`)
      window.dispatchEvent(new CustomEvent('transaction-saved'))
      logToMain('info', 'import confirmed', { imported: done.imported, skipped: done.skipped })
    } catch (err) {
      const msg = (err as ApiError).message ?? 'The import could not be completed.'
      setError(msg)
      toastError(msg)
    } finally {
      setImporting(false)
    }
  }

  const activeStep = result ? 3 : preview ? 2 : 1

  return (
    <div className="page import-page">
      <PageHeader
        title="Import Data"
        description="Ingest transactions from bank CSV statements or Excel spreadsheets into your ledger."
        actions={
          !preview ? (
            <button type="button" className="btn btn--primary" onClick={pickFile} disabled={picking}>
              <Icon name="fileSpreadsheet" size={15} />
              <span>{picking ? 'Opening…' : 'Select Spreadsheet'}</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => { setPreview(null); setMapping(null); setResult(null) }}
            >
              Choose Different File
            </button>
          )
        }
      />

      {/* Stepper Guide */}
      <div className="import-stepper" role="navigation" aria-label="Import steps">
        <div className={`import-step${activeStep >= 1 ? ' import-step--active' : ''}`}>
          <span className="import-step__num">1</span>
          <span className="import-step__label">Upload File</span>
        </div>
        <div className="import-step__line" />
        <div className={`import-step${activeStep >= 2 ? ' import-step--active' : ''}`}>
          <span className="import-step__num">2</span>
          <span className="import-step__label">Map Columns</span>
        </div>
        <div className="import-step__line" />
        <div className={`import-step${activeStep >= 3 ? ' import-step--active' : ''}`}>
          <span className="import-step__num">3</span>
          <span className="import-step__label">Review &amp; Ingest</span>
        </div>
      </div>

      {error ? (
        <div role="alert" className="notice notice--error">{error}</div>
      ) : null}

      {result ? (
        <div className="card import-result-card">
          <div className="import-result-head">
            <div className="import-result-icon">
              <Icon name="check" size={28} />
            </div>
            <div>
              <h3 className="card__title">Ingestion Complete!</h3>
              <p className="card__subtitle">Your financial records have been parsed and committed to SQLite.</p>
            </div>
          </div>

          <div className="import-summary">
            <div className="import-summary__stat card">
              <span className="import-summary__value" style={{ color: 'var(--success)' }}>{result.imported}</span>
              <span className="import-summary__label">Transactions Imported</span>
            </div>
            <div className="import-summary__stat card">
              <span className="import-summary__value" style={{ color: 'var(--text-muted)' }}>{result.skipped}</span>
              <span className="import-summary__label">Rows Skipped</span>
            </div>
          </div>

          {result.warnings.length > 0 && (
            <div className="import-warnings">
              <h4 className="import-warnings__title">Notice / Warnings ({result.warnings.length})</h4>
              <ul className="import-warnings__list">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="page-actions" style={{ marginTop: '20px' }}>
            <Link to="/transactions" className="btn btn--primary">
              <Icon name="transactions" size={15} />
              <span>View in Ledger →</span>
            </Link>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => { setPreview(null); setMapping(null); setResult(null) }}
            >
              Start Another Import
            </button>
          </div>
        </div>
      ) : !preview || !mapping ? (
        <div
          className={`dropzone card${isDragging ? ' dropzone--active' : ''}`}
          onClick={pickFile}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            void pickFile()
          }}
          role="button"
          tabIndex={0}
          aria-label="Upload CSV or Excel dropzone"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void pickFile() }}
        >
          <div className="dropzone__icon">
            <Icon name="fileSpreadsheet" size={32} />
          </div>
          <h3 className="dropzone__title">
            {picking ? 'Opening Spreadsheet…' : 'Drag & Drop CSV or Excel File'}
          </h3>
          <p className="dropzone__desc">
            Supports bank statements, credit card exports, and accounting sheets (.csv, .xlsx, .xls).
          </p>
          <div className="dropzone__types">
            <span className="dropzone__type-pill">CSV</span>
            <span className="dropzone__type-pill">XLSX</span>
            <span className="dropzone__type-pill">XLS</span>
          </div>
          <button
            type="button"
            className="btn btn--primary dropzone__btn"
            onClick={(e) => { e.stopPropagation(); void pickFile() }}
            disabled={picking}
          >
            <Icon name="search" size={15} />
            <span>{picking ? 'Loading File…' : 'Browse Computer'}</span>
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card__head-flex">
              <div>
                <h3 className="card__title">
                  {preview.fileName}
                  <span className="doc-count">{preview.totalRows.toLocaleString()} rows detected</span>
                </h3>
                <p className="card__subtitle">
                  Assign each ledger field to the corresponding column header found in your spreadsheet.
                </p>
              </div>

              <div className="import-status-pill">
                {missingRequired.length === 0 ? (
                  <span className="badge badge--income">
                    <Icon name="check" size={12} />
                    <span>All required fields mapped</span>
                  </span>
                ) : (
                  <span className="badge badge--expense">
                    <span>Missing: {missingRequired.join(', ')}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="import-mapping">
              {IMPORT_FIELDS.map((field) => {
                const isRequired = REQUIRED_FIELDS.includes(field)
                const currentVal = mapping[field]
                const isMapped = currentVal >= 0

                return (
                  <div key={field} className={`import-mapping__card card${isMapped ? ' import-mapping__card--mapped' : ''}`}>
                    <label className="import-mapping__label" htmlFor={`import-col-${field}`}>
                      <span className="import-mapping__label-text">
                        {FIELD_LABELS[field]}
                        {isRequired && <abbr title="Required column">*</abbr>}
                      </span>
                      {isMapped && (
                        <span className="import-mapping__tag">Mapped</span>
                      )}
                    </label>

                    <select
                      id={`import-col-${field}`}
                      className="select-input"
                      value={currentVal}
                      onChange={(e) => setField(field, Number(e.target.value))}
                    >
                      <option value={-1}>— Skip this field —</option>
                      {displayColumns.map((col, idx) => (
                        <option key={idx} value={idx}>
                          Column {idx + 1}: {col}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Sample Rows Preview */}
          {preview.sampleRows.length > 0 && (
            <div className="card">
              <h3 className="card__title">Spreadsheet Data Preview</h3>
              <p className="card__subtitle">
                First {preview.sampleRows.length} rows from your file. Verify column alignments below.
              </p>

              <div className="tx-table-wrap import-preview-table-wrap">
                <table className="tx-table tx-table--compact">
                  <thead>
                    <tr>
                      {displayColumns.map((col, idx) => {
                        const matchedField = IMPORT_FIELDS.find((f) => mapping[f] === idx)
                        return (
                          <th key={idx}>
                            <div className="import-col-head">
                              <span>{col}</span>
                              {matchedField && (
                                <span className="import-col-matched-badge">
                                  → {FIELD_LABELS[matchedField]}
                                </span>
                              )}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sampleRows.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {displayColumns.map((_, colIdx) => (
                          <td key={colIdx} className="import-cell">
                            {row[colIdx] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="import-actions-bar">
                <div className="import-actions-info">
                  <span>Ready to process <strong>{preview.totalRows.toLocaleString()}</strong> rows.</span>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={runImport}
                  disabled={!canImport}
                >
                  <Icon name="check" size={15} />
                  <span>{importing ? 'Importing Transactions…' : `Confirm & Import ${preview.totalRows.toLocaleString()} Rows`}</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Import