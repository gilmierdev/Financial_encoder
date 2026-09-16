import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import type { UpdateStatus } from '../../../electron/types/ipc'
import { Icon } from '../ui/Icon'

/**
 * Settings → Updates. A compact control panel for the update-notification
 * flow: current version, check for updates, and open the GitHub releases page
 * when a new version exists. The app never downloads or installs updates
 * itself; installing happens in the browser/installer.
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

  return (
    <section className="card">
      <div className="settings-card-head">
        <div>
          <h2 className="card__title">Updates</h2>
          <p className="settings-card-head__desc">
            Financial Encoder checks GitHub for new versions. When one is available you
            download and install it from the GitHub releases page; the app never updates
            itself without your action.
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
          </div>
        </div>
      ) : (
        <p className="field__hint">
          Updates are available in the installed Windows application. In development mode the updater is disabled.
        </p>
      )}

      {available ? (
        <div className="field__row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setBusy(true)
              void api.updater.openReleases().finally(() => setBusy(false))
            }}
          >
            {busy ? 'Opening…' : 'Download from GitHub'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => setStatus(null)}>
            Later
          </button>
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
            {status?.state === 'checking' ? 'Checking…' : 'Check for Updates'}
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