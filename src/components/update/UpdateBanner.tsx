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
 * Full-width banner that surfaces the update flow at the top of the content
 * area: an announcement that a new release is available with release notes, a
 * button that downloads the installer into the user's Downloads folder, and a
 * prompt to run it. The app never installs or runs anything by itself. In
 * development (unsupported state) it renders nothing.
 */
function UpdateBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [briefVisible, setBriefVisible] = useState(false)
  const briefTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const unsubscribe = api.updater.onStatus((next) => {
      setStatus(next)
      if (next.state === 'available' || next.state === 'setup-downloaded' || next.state === 'error') {
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
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void api.updater.downloadSetup()}>
            Download setup
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDismissed(true)}>
            Later
          </button>
        </div>
      </div>
    )
  }

  if (status.state === 'setup-downloading') {
    const percent = Math.min(100, Math.max(0, status.percent))
    return (
      <div className="update-banner update-banner--info" role="status">
        <Icon name="update" size={16} />
        <div className="update-banner__body">
          <p className="update-banner__title">Downloading setup {status.newVersion}&hellip;</p>
          <div className="update-banner__progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="update-banner__progress-bar" style={{ width: `${percent}%` }} />
          </div>
          <p className="update-banner__meta">
            {percent}% &middot; {status.total > 0
              ? `${formatMegabytes(status.transferred)} of ${formatMegabytes(status.total)} MB`
              : `${formatMegabytes(status.transferred)} MB`}
          </p>
        </div>
      </div>
    )
  }

  if (status.state === 'setup-downloaded') {
    return (
      <div className="update-banner update-banner--ok" role="status">
        <Icon name="update" size={16} />
        <div className="update-banner__body">
          <p className="update-banner__title">
            Setup {status.newVersion} downloaded &mdash; saved to your Downloads folder
          </p>
          <p className="update-banner__meta">Run the installer yourself to finish updating. Your data is never touched.</p>
        </div>
        <div className="update-banner__actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void api.updater.revealSetup(status.filePath)}
          >
            Show in Downloads
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDismissed(true)}>
            Done
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default UpdateBanner