import { useEffect, useRef, useState } from 'react'
import { api } from '../../services/api'
import type { UpdateStatus } from '../../../electron/types/ipc'
import { Icon } from '../ui/Icon'

const BRIEF_NOTICE_MS = 6000

/**
 * Full-width banner that surfaces the update-notification flow at the top of
 * the content area: an announcement that a new release is available with
 * release notes, plus a button that opens the GitHub releases page in the
 * browser. The app does not download or install anything itself. In
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
      if (next.state === 'available' || next.state === 'error') {
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
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void api.updater.openReleases()}>
            Download from GitHub
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDismissed(true)}>
            Later
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default UpdateBanner