import { useEffect, useRef, useState } from 'react'
import { api } from '../../services/api'
import type { UpdateStatus } from '../../../electron/types/ipc'
import { Icon } from '../ui/Icon'

const BRIEF_NOTICE_MS = 6000

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)
}

/**
 * Full-width banner that surfaces the automatic-update flow at the top of the
 * content area: an update announcement with release notes, download progress,
 * and the restart prompt. In development (unsupported state) it renders
 * nothing.
 */
function UpdateBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [briefVisible, setBriefVisible] = useState(false)
  const briefTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const unsubscribe = api.updater.onStatus((next) => {
      setBusy(false)
      setStatus(next)
      if (next.state === 'available' || next.state === 'downloaded' || next.state === 'error') {
        setDismissed(false)
      }
      if (next.state === 'check-failed') {
        setDismissed(false)
        setBriefVisible(true)
        window.clearTimeout(briefTimer.current)
        briefTimer.current = window.setTimeout(() => setBriefVisible(false), BRIEF_NOTICE_MS)
      }
    })
    void api.updater.check().then(setStatus).catch(() => undefined)
    return () => {
      window.clearTimeout(briefTimer.current)
      unsubscribe()
    }
  }, [])

  if (!status || status.state === 'unsupported' || status.state === 'checking' || dismissed) {
    return null
  }

  // No banner when the app is already up to date — that is silently fine and
  // is reported in Settings → Updates instead of being flashed on every launch.
  if (status.state === 'not-available') {
    return null
  }

  if (status.state === 'check-failed') {
    if (!briefVisible) {
      return null
    }
    return (
      <div className="update-banner update-banner--error" role="alert">
        <Icon name="update" size={16} />
        <span className="update-banner__text">{status.message}</span>
        <button type="button" className="update-banner__link" onClick={() => void api.updater.check()}>
          Try again
        </button>
        <button type="button" className="update-banner__dismiss" aria-label="Dismiss" onClick={() => setDismissed(true)}>
          &times;
        </button>
      </div>
    )
  }

  if (status.state === 'error') {
    return (
      <div className="update-banner update-banner--error" role="alert">
        <Icon name="update" size={16} />
        <span className="update-banner__text">{status.message}</span>
        <button type="button" className="update-banner__dismiss" aria-label="Dismiss" onClick={() => setDismissed(true)}>
          &times;
        </button>
      </div>
    )
  }

  if (status.state === 'available') {
    return (
      <div className="update-banner update-banner--info" role="status">
        <Icon name="update" size={16} />
        <div className="update-banner__body">
          <p className="update-banner__title">
            Update available: Financial Encoder {status.newVersion}
            <span className="update-banner__subtitle">(you have {status.currentVersion})</span>
          </p>
          {status.releaseNotes.length > 0 && (
            <ul className="update-banner__notes">
              {status.releaseNotes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="update-banner__actions">
          {busy ? (
            <span className="update-banner__busy">Starting download&hellip;</span>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => {
                  setBusy(true)
                  void api.updater.download().then(setStatus).catch(() => undefined)
                }}
              >
                Update Now
              </button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDismissed(true)}>
                Later
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (status.state === 'downloading') {
    const percent = Math.min(100, Math.max(0, status.percent))
    return (
      <div className="update-banner update-banner--info" role="status">
        <Icon name="update" size={16} />
        <div className="update-banner__body">
          <p className="update-banner__title">Downloading update&hellip;</p>
          <div className="update-banner__progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="update-banner__progress-bar" style={{ width: `${percent}%` }} />
          </div>
          <p className="update-banner__meta">
            {percent}% &middot; {formatMegabytes(status.transferred)} of {formatMegabytes(status.total)} MB
          </p>
        </div>
      </div>
    )
  }

  if (status.state === 'downloaded') {
    return (
      <div className="update-banner update-banner--ok" role="status">
        <Icon name="update" size={16} />
        <div className="update-banner__body">
          <p className="update-banner__title">Update ready &mdash; restart to install Financial Encoder {status.newVersion}</p>
          <p className="update-banner__meta">A data backup is created automatically before the app restarts.</p>
        </div>
        <div className="update-banner__actions">
          {busy ? (
            <span className="update-banner__busy">Restarting&hellip;</span>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => {
                  setBusy(true)
                  void api.updater.install().then(setStatus).catch(() => undefined)
                }}
              >
                Restart &amp; Update
              </button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDismissed(true)}>
                Later
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (status.state === 'installing') {
    return (
      <div className="update-banner update-banner--ok" role="status">
        <Icon name="update" size={16} />
        <span>Installing Financial Encoder {status.newVersion} &mdash; the app will restart shortly&hellip;</span>
      </div>
    )
  }

  return null
}

export default UpdateBanner