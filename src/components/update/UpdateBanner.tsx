import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../electron/types/ipc'
import { api } from '../../services/api'

function UpdateBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsub = api.updater.onStatus((s) => {
      setStatus(s)
      if (s.state !== 'error' && s.state !== 'check-failed') {
        setDismissed(false)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    void api.updater.check().then(setStatus).catch(() => {})
  }, [])

  if (!status || status.state === 'unsupported' || status.state === 'not-available') return null
  if (dismissed && (status.state === 'error' || status.state === 'check-failed')) return null

  if (status.state === 'checking') {
    return (
      <div className="update-banner update-banner--info">
        <div className="update-banner__body">
          <span className="update-banner__title">Checking for updates…</span>
        </div>
      </div>
    )
  }

  if (status.state === 'check-failed') {
    return (
      <div className="update-banner update-banner--error">
        <div className="update-banner__body">
          <span className="update-banner__title">We couldn't check for updates right now.</span>
          <span className="update-banner__subtitle">Financial Encoder will continue working normally.</span>
        </div>
        <div className="update-banner__actions">
          <button type="button" className="btn btn--small btn--secondary" onClick={() => void api.updater.check().then(setStatus)}>
            Try again
          </button>
          <button type="button" className="update-banner__dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
            ×
          </button>
        </div>
      </div>
    )
  }

  if (status.state === 'error') {
    return (
      <div className="update-banner update-banner--error">
        <div className="update-banner__body">
          <span className="update-banner__title">{status.message}</span>
        </div>
        <div className="update-banner__actions">
          <button type="button" className="update-banner__dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
            ×
          </button>
        </div>
      </div>
    )
  }

  if (status.state === 'available') {
    return (
      <div className="update-banner update-banner--info">
        <div className="update-banner__body">
          <span className="update-banner__title">
            A new version of Financial Encoder is available.
          </span>
          <span className="update-banner__subtitle">
            Current: {status.currentVersion} → New: {status.newVersion}
          </span>
        </div>
        <div className="update-banner__actions">
          <button type="button" className="btn btn--small btn--primary" onClick={() => void api.updater.download().then(setStatus)}>
            Download update
          </button>
          <button type="button" className="update-banner__dismiss" onClick={() => setDismissed(true)} aria-label="Later">
            ×
          </button>
        </div>
      </div>
    )
  }

  if (status.state === 'downloading') {
    return (
      <div className="update-banner update-banner--info">
        <div className="update-banner__body">
          <span className="update-banner__title">Downloading update… {status.percent}%</span>
          <div className="update-banner__progress">
            <div className="update-banner__progress-bar" style={{ width: `${status.percent}%` }} />
          </div>
        </div>
      </div>
    )
  }

  if (status.state === 'downloaded') {
    return (
      <div className="update-banner update-banner--ok">
        <div className="update-banner__body">
          <span className="update-banner__title">
            Update downloaded — Financial Encoder {status.newVersion} is ready to install.
          </span>
        </div>
        <div className="update-banner__actions">
          <button type="button" className="btn btn--small btn--primary" onClick={() => void api.updater.install()}>
            Restart &amp; install
          </button>
          <button type="button" className="update-banner__dismiss" onClick={() => setDismissed(true)} aria-label="Later">
            ×
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default UpdateBanner
