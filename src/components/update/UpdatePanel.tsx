import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import type { UpdateStatus } from '../../../electron/types/ipc'
import { Icon } from '../ui/Icon'

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)
}

/**
 * Settings → Updates. A compact control panel for the self-update flow:
 * current version, check for updates, download, and restart-and-install.
 * Mirrors the status the UpdateBanner uses, but stays in Settings.
 */
function UpdatePanel(): React.JSX.Element {
  const [currentVersion, setCurrentVersion] = useState<string>('')
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void api.app
      .getInfo()
      .then((info) => {
        if (!cancelled) {
          setCurrentVersion(info.version)
        }
      })
      .catch(() => undefined)

    const unsubscribe = api.updater.onStatus((next) => {
      setBusy(false)
      setStatus(next)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const available = status?.state === 'available'
  const downloaded = status?.state === 'downloaded'

  return (
    <section className="card">
      <div className="settings-card-head">
        <div>
          <h2 className="card__title">Updates</h2>
          <p className="settings-card-head__desc">
            Financial Encoder checks GitHub for new versions and updates itself automatically
            without touching your financial data.
          </p>
        </div>
      </div>

      <div className="field">
        <span className="field__label">Current version</span>
        <span className="field__hint update-panel__version">
          <Icon name="update" size={14} />
          {currentVersion || '…'}
        </span>
      </div>

      {status && status.state !== 'unsupported' ? (
        <div className="field">
          <span className="field__label">Status</span>
          <div className="update-panel__status">
            {status.state === 'checking' && <span className="field__hint">Checking for updates&hellip;</span>}

            {status.state === 'not-available' && (
              <span className="field__hint">No update is currently available.</span>
            )}

            {status.state === 'check-failed' && (
              <span className="field__hint update-panel__error">{status.message}</span>
            )}

            {status.state === 'error' && (
              <span className="field__hint update-panel__error">{status.message}</span>
            )}

            {available && (
              <span className="field__hint">
                New version available: {status.newVersion} (you have {status.currentVersion})
              </span>
            )}

            {status.state === 'downloading' && (
              <span className="field__hint">
                Downloading update&hellip; {Math.min(100, Math.max(0, status.percent))}% &middot;{' '}
                {formatMegabytes(status.transferred)} of {formatMegabytes(status.total)} MB
              </span>
            )}

            {downloaded && (
              <span className="field__hint">Update ready &mdash; restart and install {status.newVersion}.</span>
            )}

            {status.state === 'installing' && (
              <span className="field__hint">Installing {status.newVersion} &mdash; the app will restart shortly&hellip;</span>
            )}
          </div>
        </div>
      ) : (
        <p className="field__hint">
          Updates are available in the installed Windows application. In development mode the updater is disabled.
        </p>
      )}

      {available ? (
        <div className="field__row">
          {busy ? (
            <span className="field__hint">Starting download&hellip;</span>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setBusy(true)
                  void api.updater.download().then(setStatus).catch(() => undefined)
                }}
              >
                Download Update
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => setStatus(null)}>
                Later
              </button>
            </>
          )}
        </div>
      ) : downloaded ? (
        <div className="field__row">
          {busy ? (
            <span className="field__hint">Restarting&hellip;</span>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setBusy(true)
                  void api.updater.install().then(setStatus).catch(() => undefined)
                }}
              >
                Restart and Install
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => setStatus(null)}>
                Later
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="field__row">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy || status?.state === 'checking'}
            onClick={() => {
              setBusy(true)
              void api.updater.check().then(setStatus).catch(() => undefined)
            }}
          >
            {status?.state === 'checking' ? 'Checking&hellip;' : 'Check for Updates'}
          </button>
        </div>
      )}

      {status?.state === 'check-failed' ? (
        <div className="field__row">
          <button type="button" className="btn btn--small btn--secondary" onClick={() => void api.updater.check()}>
            Try Again
          </button>
        </div>
      ) : null}
    </section>
  )
}

export default UpdatePanel