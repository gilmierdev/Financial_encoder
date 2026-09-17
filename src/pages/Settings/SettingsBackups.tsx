import { useCallback, useEffect, useState } from 'react'
import SettingsPage from './SettingsPage'
import SettingsSection from '../../components/ui/SettingsSection'
import ConfirmModal from '../../components/ui/ConfirmModal'
import { Icon } from '../../components/ui/Icon'
import { logToMain } from '../../services/logger'
import { api, ApiError } from '../../services/api'
import type { BackupRecord } from '../../../electron/types/ipc'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Yesterday' : `${days}d ago`
}

type ConfirmAction =
  | { kind: 'import' }
  | { kind: 'restore'; record: BackupRecord }
  | { kind: 'delete'; record: BackupRecord }
  | null

function SettingsBackups(): React.JSX.Element {
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupNotice, setBackupNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
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
    setBusyAction(`delete-${record.id}`)
    setBackupNotice(null)
    try {
      await api.backups.delete(record.id)
      setBackupNotice({ kind: 'ok', text: 'Backup deleted.' })
      await loadBackups()
    } catch (err) {
      setBackupNotice({ kind: 'error', text: (err as ApiError).message ?? 'The backup could not be deleted.' })
    } finally {
      setBusyAction(null)
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
    }
  }

  const confirmTitle = pendingConfirm?.kind === 'import'
    ? 'Restore from backup file'
    : pendingConfirm?.kind === 'restore'
      ? 'Restore backup'
      : 'Delete backup'

  const confirmLabel = pendingConfirm?.kind === 'import'
    ? 'Choose file…'
    : pendingConfirm?.kind === 'restore'
      ? 'Restore'
      : 'Delete'

  const confirmMessage = pendingConfirm?.kind === 'import' ? (
    <>A backup file you select will replace the current database.<br />A safety copy of the current data is made first.</>
  ) : pendingConfirm?.kind === 'restore' ? (
    <>Restore <strong>{pendingConfirm.record.filename}</strong>? The current database will be replaced. A safety copy is made first.</>
  ) : pendingConfirm?.kind === 'delete' ? (
    <>Delete backup <strong>{pendingConfirm.record.filename}</strong>? This cannot be undone.</>
  ) : null

  return (
    <SettingsPage description="Create snapshots to protect your data, restore from a backup file, or export one to another computer.">
      <div className="settings-grid">
        <SettingsSection
          id="s-backups"
          icon="archive"
          title="Backup &amp; Restore"
          description="Snapshots of your local database. Export a backup and restore it on any computer running Financial Encoder. Restoring replaces the current data."
          actions={
            <>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => void exportBackup()} disabled={busyAction !== null}>
                {busyAction === 'export' ? 'Exporting\u2026' : 'Export'}
              </button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPendingConfirm({ kind: 'import' })} disabled={busyAction !== null}>
                {busyAction === 'import' ? 'Restoring\u2026' : 'Restore'}
              </button>
              <button type="button" className="btn btn--primary btn--sm" onClick={createBackup} disabled={busyAction !== null}>
                {busyAction === 'create' ? 'Creating\u2026' : 'Create backup'}
              </button>
            </>
          }
        >
          {backupNotice ? (
            <div role="status" className={`notice notice--${backupNotice.kind}`}>
              {backupNotice.text}
            </div>
          ) : null}

          {backupLoading && backups.length === 0 ? (
            <div className="spinner" style={{ margin: '16px auto' }} aria-label="Loading backups" />
          ) : backups.length === 0 ? (
            <div className="settings-empty">
              <Icon name="archive" size={32} />
              <p>No backups yet. Create one to protect your data.</p>
            </div>
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
                      <td title={new Date(record.created_at).toLocaleString()}>{timeAgo(record.created_at)}</td>
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
        </SettingsSection>
      </div>

      {pendingConfirm ? (
        <ConfirmModal
          open={pendingConfirm !== null}
          title={confirmTitle}
          message={confirmMessage}
          confirmLabel={confirmLabel}
          danger={pendingConfirm?.kind === 'delete'}
          busy={busyAction !== null}
          onConfirm={confirmPendingAction}
          onCancel={() => setPendingConfirm(null)}
        />
      ) : null}
    </SettingsPage>
  )
}

export default SettingsBackups