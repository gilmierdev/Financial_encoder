import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../electron/types/ipc'
import { api } from '../../services/api'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function UpdatePanel(): React.JSX.Element {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'unsupported' })
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const unsub = api.updater.onStatus(setStatus)
    return unsub
  }, [])

  useEffect(() => {
    void api.updater.check().then(setStatus).catch(() => {})
  }, [])

  async function handleCheck(): Promise<void> {
    setChecking(true)
    try {
      await api.updater.check().then(setStatus)
    } catch {
      // handled by onStatus
    } finally {
      setChecking(false)
    }
  }

  if (status.state === 'unsupported') {
    return (
      <p className="chart-empty" style={{ margin: 0 }}>
        Auto-update is only available in the installed production version.
      </p>
    )
  }

  return (
    <>
      {status.state === 'checking' && (
        <div className="update-panel__status">
          <div className="spinner" aria-label="Checking for updates" />
          <span>Checking for updates…</span>
        </div>
      )}

      {status.state === 'not-available' && (
        <>
          <p style={{ margin: '0 0 8px' }}>
            <span className="update-panel__version">Version {status.currentVersion}</span>
          </p>
          <p style={{ margin: 0 }}>You're using the latest version.</p>
        </>
      )}

      {status.state === 'available' && (
        <>
          <p style={{ margin: '0 0 4px' }}>
            <span className="update-panel__version">Version {status.currentVersion}</span>
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <span className="update-panel__version" style={{ color: 'var(--accent)' }}>
              New version {status.newVersion} is available.
            </span>
          </p>
          <button type="button" className="btn btn--primary" onClick={() => void api.updater.download().then(setStatus)}>
            Download update
          </button>
        </>
      )}

      {status.state === 'downloading' && (
        <>
          <p style={{ margin: '0 0 4px' }}>Downloading update…</p>
          <div className="update-banner__progress" style={{ marginBottom: 8 }}>
            <div className="update-banner__progress-bar" style={{ width: `${status.percent}%` }} />
          </div>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
            {status.percent}%{status.total > 0 ? ` of ${formatBytes(status.total)}` : ''}
          </p>
        </>
      )}

      {status.state === 'downloaded' && (
        <>
          <p style={{ margin: '0 0 8px' }}>
            <span className="update-panel__version">
              Financial Encoder {status.newVersion} is ready to install.
            </span>
          </p>
          <span className="table-actions">
            <button type="button" className="btn btn--primary" onClick={() => void api.updater.install()}>
              Restart &amp; install
            </button>
            <button type="button" className="btn btn--secondary" onClick={handleCheck} disabled={checking}>
              Check again
            </button>
          </span>
        </>
      )}

      {status.state === 'check-failed' && (
        <>
          <p className="update-panel__error" style={{ margin: '0 0 8px' }}>{status.message}</p>
          <button type="button" className="btn btn--secondary" onClick={handleCheck} disabled={checking}>
            Try again
          </button>
        </>
      )}

      {status.state === 'error' && (
        <>
          <p className="update-panel__error" style={{ margin: '0 0 8px' }}>{status.message}</p>
          <button type="button" className="btn btn--secondary" onClick={handleCheck} disabled={checking}>
            Try again
          </button>
        </>
      )}

      {status.state !== 'downloading' && status.state !== 'available' && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--secondary" onClick={handleCheck} disabled={checking || status.state === 'checking'}>
            Check for updates
          </button>
        </div>
      )}
    </>
  )
}

export default UpdatePanel
