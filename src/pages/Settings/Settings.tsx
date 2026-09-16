import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import ConfirmModal from '../../components/ui/ConfirmModal'
import TypeToConfirmModal from '../../components/ui/TypeToConfirmModal'
import { useSettings } from '../../contexts/SettingsContext'
import { currencySymbol } from '../../utils/currency'
import { logToMain } from '../../services/logger'
import { api, ApiError } from '../../services/api'
import UpdatePanel from '../../components/update/UpdatePanel'
import type { BackupRecord } from '../../../electron/types/ipc'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

type ConfirmAction =
  | { kind: 'import' }
  | { kind: 'restore'; record: BackupRecord }
  | { kind: 'delete'; record: BackupRecord }
  | { kind: 'reset' }
  | null

function Settings(): React.JSX.Element {
  const { settings, loading, error, setSetting } = useSettings()
  const [appName, setAppName] = useState('')
  const [currency, setCurrency] = useState('')
  const [dateFormat, setDateFormat] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupNotice, setBackupNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetNotice, setResetNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmAction>(null)

  const loadBackups = useCallback(async (): Promise<void> => {
    try {
      setBackups(await api.backups.list())
    } catch (err) {
      logToMain('error', 'backup list failed', { message: (err as ApiError).message })
    }
  }, [])

  useEffect(() => {
    void loadBackups()
  }, [loadBackups])

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Settings" description="Application preferences." />
        <div className="card"><div className="spinner" aria-label="Loading settings" /></div>
      </div>
    )
  }

  if (error || !settings) {
    return (
      <div className="page">
        <PageHeader title="Settings" description="Application preferences." />
        <div className="card card--error">Settings could not be loaded: {error}</div>
      </div>
    )
  }

  const settingLabel = (key: keyof typeof settings): string => {
    switch (key) {
      case 'appName': return 'Application name'
      case 'currency': return 'Currency'
      case 'dateFormat': return 'Date format'
      default: return key.charAt(0).toUpperCase() + key.slice(1)
    }
  }

  const save = async (key: keyof typeof settings, value: string): Promise<void> => {
    setSaving(key)
    setNotice(null)
    try {
      await setSetting(key, value)
      setNotice({ kind: 'ok', text: `${settingLabel(key)} saved.` })
    } catch (err) {
      const message = (err as ApiError).message ?? 'Settings could not be saved.'
      setNotice({ kind: 'error', text: `${settingLabel(key)} could not be saved. ${message}` })
      logToMain('error', 'settings save failed', { key, message })
    } finally {
      setSaving(null)
    }
  }

  async function createBackup(): Promise<void> {
    setBusyAction('create')
    setBackupNotice(null)
    try {
      await api.backups.create()
      setBackupNotice({ kind: 'ok', text: 'Backup created.' })
      await loadBackups()
    } catch (err) {
      setBackupNotice({ kind: 'error', text: (err as ApiError).message ?? 'The backup could not be created.' })
    } finally {
      setBusyAction(null)
    }
  }

  async function exportBackup(): Promise<void> {
    setBusyAction('export')
    setBackupNotice(null)
    try {
      const result = await api.backups.export()
      setBackupNotice({ kind: 'ok', text: `Backup exported to ${result.filePath}` })
      await loadBackups()
    } catch (err) {
      if ((err as ApiError).message !== 'Backup export cancelled.') {
        setBackupNotice({ kind: 'error', text: (err as ApiError).message ?? 'The backup could not be exported.' })
      }
    } finally {
      setBusyAction(null)
    }
  }

  async function runImportBackupFromFile(): Promise<void> {
    setBusyAction('import')
    setBackupNotice(null)
    try {
      const result = await api.backups.importFromFile()
      setBackupNotice({
        kind: 'ok',
        text: `Restored "${result.filename}". The data was reloaded${result.safetyBackup ? ` (safety copy: ${result.safetyBackup})` : ''}.`,
      })
      await loadBackups()
    } catch (err) {
      if ((err as ApiError).message !== 'No file selected.') {
        setBackupNotice({ kind: 'error', text: (err as ApiError).message ?? 'The backup could not be restored.' })
      }
    } finally {
      setBusyAction(null)
    }
  }

  async function runRestoreBackup(record: BackupRecord): Promise<void> {
    setBusyAction(`restore-${record.id}`)
    setBackupNotice(null)
    setBackupLoading(true)
    try {
      await api.backups.restore(record.id)
      setBackupNotice({ kind: 'ok', text: 'Backup restored. The data was reloaded.' })
      await loadBackups()
    } catch (err) {
      setBackupNotice({ kind: 'error', text: (err as ApiError).message ?? 'The backup could not be restored.' })
    } finally {
      setBusyAction(null)
      setBackupLoading(false)
    }
  }

  async function runRemoveBackup(record: BackupRecord): Promise<void> {
    setBackupNotice(null)
    try {
      await api.backups.delete(record.id)
      setBackupNotice({ kind: 'ok', text: 'Backup deleted.' })
      await loadBackups()
    } catch (err) {
      setBackupNotice({ kind: 'error', text: (err as ApiError).message ?? 'The backup could not be deleted.' })
    }
  }

  async function runResetAllData(): Promise<void> {
    setResetBusy(true)
    setResetNotice(null)
    try {
      await api.db.reset()
      window.location.reload()
    } catch (err) {
      setResetNotice({ kind: 'error', text: (err as ApiError).message ?? 'The data could not be reset.' })
      logToMain('error', 'data reset failed', { message: (err as ApiError).message })
    } finally {
      setResetBusy(false)
    }
  }

  function confirmPendingAction(): void {
    const action = pendingConfirm
    setPendingConfirm(null)
    if (!action) {
      return
    }
    if (action.kind === 'import') {
      void runImportBackupFromFile()
    } else if (action.kind === 'restore') {
      void runRestoreBackup(action.record)
    } else if (action.kind === 'delete') {
      void runRemoveBackup(action.record)
    } else {
      void runResetAllData()
    }
  }

  function confirmReset(): void {
    setPendingConfirm(null)
    void runResetAllData()
  }

  const confirmTitle = pendingConfirm?.kind === 'import'
    ? 'Restore from backup file'
    : pendingConfirm?.kind === 'restore'
      ? 'Restore backup'
      : pendingConfirm?.kind === 'delete'
        ? 'Delete backup'
        : 'Reset all data'

  const confirmLabel = pendingConfirm?.kind === 'import'
    ? 'Choose file…'
    : pendingConfirm?.kind === 'restore'
      ? 'Restore'
      : pendingConfirm?.kind === 'delete'
        ? 'Delete'
        : 'Reset everything'

  const confirmMessage = pendingConfirm?.kind === 'import' ? (
    <>A backup file you select will replace the current database.<br />A safety copy of the current data is made first.</>
  ) : pendingConfirm?.kind === 'restore' ? (
    <>Restore <strong>{pendingConfirm.record.filename}</strong>? The current database will be replaced. A safety copy is made first.</>
  ) : pendingConfirm?.kind === 'delete' ? (
    <>Delete backup <strong>{pendingConfirm.record.filename}</strong>? This cannot be undone.</>
  ) : (
    <>Every transaction, category, setting and backup will be deleted and the app will restart fresh. This cannot be undone.</>
  )

  return (
    <div className="page">
      <PageHeader title="Settings" description="Application preferences." />

      {notice ? (
        <div role="status" className={`notice notice--${notice.kind}`}>
          {notice.text}
        </div>
      ) : null}

      <div className="settings-grid">
        <section className="card">
          <h2 className="card__title">General</h2>

          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault()
              const value = appName.trim()
              if (value && value !== settings.appName) {
                void save('appName', value)
              }
            }}
          >
            <label className="field__label" htmlFor="setting-app-name">Application name</label>
            <span className="field__row">
              <input
                id="setting-app-name"
                className="text-input"
                value={appName || settings.appName}
                onChange={(e) => setAppName(e.target.value)}
                onBlur={() => {
                  const value = appName.trim()
                  if (value && value !== settings.appName) {
                    void save('appName', value)
                  } else {
                    setAppName('')
                  }
                }}
                maxLength={40}
              />
              <button
                type="submit"
                className="btn btn--secondary"
                disabled={!appName.trim() || appName.trim() === settings.appName || saving === 'appName'}
              >
                {saving === 'appName' ? 'Saving…' : 'Save'}
              </button>
            </span>
          </form>

          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault()
              const value = currency.trim()
              if (value && value !== settings.currency) {
                void save('currency', value)
              }
            }}
          >
            <label className="field__label" htmlFor="setting-currency">Currency</label>
            <span className="field__row">
              <input
                id="setting-currency"
                className="text-input"
                value={currency || settings.currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                onBlur={() => {
                  const value = currency.trim()
                  if (value && value !== settings.currency) {
                    void save('currency', value)
                  } else {
                    setCurrency('')
                  }
                }}
                maxLength={3}
                placeholder="e.g. PHP"
                inputMode="text"
                autoComplete="off"
              />
              <button
                type="submit"
                className="btn btn--secondary"
                disabled={!currency.trim() || currency.trim().toUpperCase() === settings.currency || saving === 'currency'}
              >
                {saving === 'currency' ? 'Saving…' : 'Save'}
              </button>
            </span>
            <span className="field__hint">
              Symbol preview: {currencySymbol(currency || settings.currency)}
            </span>
          </form>

          <div className="field">
            <label className="field__label" htmlFor="setting-date-format">Date format</label>
            <select
              id="setting-date-format"
              className="select-input"
              value={dateFormat || settings.dateFormat}
              onChange={(e) => {
                const value = e.target.value
                setDateFormat(value)
                if (value !== settings.dateFormat) {
                  void save('dateFormat', value)
                }
              }}
              disabled={saving === 'dateFormat'}
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD (2026-09-14)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (09/14/2026)</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY (14/09/2026)</option>
            </select>
          </div>

          <div className="field">
            <span className="field__label" id="setting-theme-label">
              Theme
            </span>
            <div className="field__row" role="group" aria-labelledby="setting-theme-label">
              {(['light', 'dark', 'system'] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={`btn btn--segment${settings.theme === theme ? ' btn--segment-active' : ''}`}
                  role="radio"
                  aria-checked={settings.theme === theme}
                  onClick={() => {
                    if (theme !== settings.theme) {
                      void save('theme', theme)
                    }
                  }}
                  disabled={saving === 'theme'}
                >
                  {theme.charAt(0).toUpperCase() + theme.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="settings-grid">
        <UpdatePanel />
      </div>

      <div className="settings-grid">
        <section className="card">
          <div className="settings-card-head">
            <div>
              <h2 className="card__title">Backup &amp; Restore</h2>
              <p className="settings-card-head__desc">
                Snapshots of your local database. Export a backup to a USB drive or another folder, then restore it on
                any computer running Financial Encoder. Restoring replaces the current data.
              </p>
            </div>
            <span className="table-actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => void exportBackup()}
                disabled={busyAction !== null}
              >
                {busyAction === 'export' ? 'Exporting…' : 'Export backup…'}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setPendingConfirm({ kind: 'import' })}
                disabled={busyAction !== null}
              >
                {busyAction === 'import' ? 'Restoring…' : 'Restore from file…'}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={createBackup}
                disabled={busyAction !== null}
              >
                {busyAction === 'create' ? 'Creating…' : 'Create backup'}
              </button>
            </span>
          </div>

          {backupNotice ? (
            <div role="status" className={`notice notice--${backupNotice.kind}`}>
              {backupNotice.text}
            </div>
          ) : null}

          {backupLoading && backups.length === 0 ? (
            <div className="spinner" style={{ margin: '16px auto' }} aria-label="Loading backups" />
          ) : backups.length === 0 ? (
            <p className="chart-empty" style={{ margin: 0 }}>
              No backups yet. Create one to protect your data.
            </p>
          ) : (
            <div className="tx-table-wrap">
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Filename</th>
                    <th className="tx-table__amount">Size</th>
                    <th className="tx-table__amount">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDate(record.created_at)}</td>
                      <td>{record.filename}</td>
                      <td className="tx-table__amount">{formatBytes(record.size_bytes)}</td>
                      <td className="tx-table__amount">
                        <span className="table-actions">
                          <button
                            type="button"
                            className="btn btn--small btn--primary"
                            onClick={() => setPendingConfirm({ kind: 'restore', record })}
                            disabled={busyAction !== null}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            className="btn btn--small btn--danger"
                            onClick={() => setPendingConfirm({ kind: 'delete', record })}
                            disabled={busyAction !== null}
                          >
                            Delete
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="settings-grid">
        <section className="card">
          <div className="settings-card-head">
            <div>
              <h2 className="card__title">Reset all data</h2>
              <p className="settings-card-head__desc">
                Deletes every transaction, category, setting and backup, then restarts the app with defaults. A safety
                snapshot is kept in the backups folder before wiping, so the previous data can still be restored.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => setPendingConfirm({ kind: 'reset' })}
              disabled={resetBusy || busyAction !== null}
            >
              {resetBusy ? 'Resetting…' : 'Reset all data…'}
            </button>
          </div>

          {resetNotice ? (
            <div role="status" className={`notice notice--${resetNotice.kind}`}>
              {resetNotice.text}
            </div>
          ) : null}
        </section>
      </div>

      {pendingConfirm && pendingConfirm.kind !== 'reset' ? (
        <ConfirmModal
          open={pendingConfirm !== null}
          title={confirmTitle}
          message={confirmMessage}
          confirmLabel={confirmLabel}
          danger={pendingConfirm?.kind === 'delete'}
          busy={busyAction !== null || resetBusy}
          onConfirm={confirmPendingAction}
          onCancel={() => setPendingConfirm(null)}
        />
      ) : null}

      <TypeToConfirmModal
        open={pendingConfirm?.kind === 'reset'}
        title="Reset All Data"
        message="All financial data will be permanently deleted."
        confirmLabel="Reset All Data"
        requiredText="RESET ALL DATA"
        busy={resetBusy}
        busyLabel="Resetting…"
        onConfirm={confirmReset}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  )
}

export default Settings