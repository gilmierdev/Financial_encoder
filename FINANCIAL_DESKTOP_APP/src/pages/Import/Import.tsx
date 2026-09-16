import { useMemo, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import { api, ApiError } from '../../services/api'
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
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<Record<ImportField, number> | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [picking, setPicking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    } catch (err) {
      if (err instanceof ApiError && err.code !== 'IMPORT_CANCELLED') {
        setError(err.message)
      } else if (!(err instanceof ApiError)) {
        setError('The file could not be opened.')
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
      logToMain('info', 'import confirmed', { imported: done.imported, skipped: done.skipped })
    } catch (err) {
      setError((err as ApiError).message ?? 'The import could not be completed.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Import"
        description="Bring transactions in from a CSV or Excel file for review before saving."
        actions={
          <button type="button" className="btn btn--primary" onClick={pickFile} disabled={picking}>
            {picking ? 'Opening…' : 'Select file'}
          </button>
        }
      />

      {error ? (
        <div role="alert" className="notice notice--error">{error}</div>
      ) : null}

      {result ? (
        <div className="card">
          <h3 className="card__title">Import Complete</h3>
          <div className="import-summary">
            <div className="import-summary__stat">
              <span className="import-summary__value">{result.imported}</span>
              <span className="import-summary__label">Imported</span>
            </div>
            <div className="import-summary__stat">
              <span className="import-summary__value">{result.skipped}</span>
              <span className="import-summary__label">Skipped</span>
            </div>
          </div>
          {result.warnings.length > 0 && (
            <div className="import-warnings">
              <h4 className="import-warnings__title">Warnings</h4>
              <ul className="import-warnings__list">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="page-actions">
            <button type="button" className="btn btn--secondary" onClick={() => { setPreview(null); setMapping(null); setResult(null) }}>
              Start a new import
            </button>
          </div>
        </div>
      ) : !preview || !mapping ? (
        <div className="card">
          <p className="import-hint">
            Import expects a header row with columns such as <em>Date</em>, <em>Description</em>, <em>Amount</em>,
            <em> Type</em> and <em>Category</em>. The date, description and amount columns are required.
          </p>
          <p className="import-hint">
            Nothing is saved automatically — you review rows and the column mapping, then confirm the import.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <h3 className="card__title">
              {preview.fileName}
              <span className="import-count">{preview.totalRows.toLocaleString()} rows detected</span>
            </h3>

            <div className="import-mapping">
              {IMPORT_FIELDS.map((field) => (
                <label className="import-mapping__row" key={field}>
                  <span className={`import-mapping__label${REQUIRED_FIELDS.includes(field) ? ' import-mapping__label--required' : ''}`}>
                    {FIELD_LABELS[field]}
                    {REQUIRED_FIELDS.includes(field) ? <abbr title="Required">*</abbr> : null}
                  </span>
                  <select
                    className={`select-input${REQUIRED_FIELDS.includes(field) && mapping[field] < 0 ? ' select-input--invalid' : ''}`}
                    value={mapping[field]}
                    onChange={(e) => setField(field, Number(e.target.value))}
                    aria-label={`${FIELD_LABELS[field]} column${REQUIRED_FIELDS.includes(field) ? ' (required)' : ''}`}
                  >
                    <option value={-1}>— ignore —</option>
                    {displayColumns.map((col, index) => (
                      <option key={index} value={index}>{col || `Column ${String.fromCharCode(65 + index)}`}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="tx-table-wrap import-preview">
              <p className="import-preview__label">Preview (first {preview.sampleRows.length} rows)</p>
              {preview.sampleRows.length === 0 ? (
                <p className="chart-empty">No data rows found.</p>
              ) : (
                <table className="tx-table">
                  <thead>
                    <tr>
                      {displayColumns.map((col, index) => (
                        <th key={index}>{col || `Column ${String.fromCharCode(65 + index)}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sampleRows.map((row, r) => (
                      <tr key={r}>
                        {displayColumns.map((_, index) => (
                          <td key={index}>{row[index] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="page-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={runImport}
                disabled={!canImport}
              >
                {importing ? 'Importing…' : `Import ${preview.totalRows.toLocaleString()} transaction${preview.totalRows === 1 ? '' : 's'}`}
              </button>
              <button type="button" className="btn btn--secondary" onClick={pickFile}>
                Pick a different file
              </button>
            </div>
          </div>

          {!canImport && preview.totalRows === 0 ? (
            <p className="notice">No data rows were found in the selected file. Pick a different file, or ignore this one.</p>
          ) : !canImport ? (
            <p className="notice">
              {missingRequired.length > 0
                ? `Map the required column${missingRequired.length === 1 ? '' : 's'}: ${missingRequired.map((f) => FIELD_LABELS[f]).join(', ')}.`
                : 'Nothing to import — map at least one data row before importing.'}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

export default Import