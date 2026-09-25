import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSettings } from '../../contexts/SettingsContext'
import { formatDate } from '../../utils/dates'
import { Icon } from '../ui/Icon'

interface TopBarProps {
  onOpenAddTransaction?: () => void
  onOpenShortcuts?: () => void
}

function TopBar({ onOpenAddTransaction, onOpenShortcuts }: TopBarProps): React.JSX.Element {
  const { settings, setSetting } = useSettings()
  const navigate = useNavigate()
  const [now, setNow] = useState(() => new Date())
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const dateFormat = settings?.dateFormat ?? 'YYYY-MM-DD'
  const dateLabel = formatDate(now, dateFormat)
  const isDark = settings?.theme === 'dark'

  const toggleTheme = (): void => {
    const nextTheme = isDark ? 'light' : 'dark'
    void setSetting('theme', nextTheme)
  }

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const q = query.trim()
    navigate(q ? `/transactions?q=${encodeURIComponent(q)}` : '/transactions')
    setQuery('')
  }

  return (
    <header className="topbar">
      <div className="topbar__left">
        <Link to="/dashboard" className="topbar__brand-link" title="Go to Dashboard">
          <div className="topbar__logo" aria-hidden="true">
            <Icon name="capital" size={16} />
          </div>
          <span className="topbar__app-name">{settings?.appName ?? 'Financial Encoder'}</span>
        </Link>
      </div>

      <form className="topbar__search" role="search" onSubmit={handleSearchSubmit}>
        <span className="topbar__search-icon" aria-hidden="true">
          <Icon name="search" size={15} />
        </span>
        <input
          id="global-search-input"
          type="search"
          className="topbar__search-input"
          placeholder="Search transactions… (/)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search transactions"
          spellCheck={false}
        />
        {query ? (
          <button
            type="button"
            className="topbar__search-clear"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            <Icon name="x" size={13} />
          </button>
        ) : (
          <kbd className="topbar__search-kbd" aria-hidden="true">/</kbd>
        )}
      </form>

      <div className="topbar__right">
        {onOpenAddTransaction && (
          <button
            type="button"
            className="btn btn--primary btn--sm topbar__add-btn"
            onClick={onOpenAddTransaction}
            title="Add transaction (Press N)"
          >
            <Icon name="plus" size={14} />
            <span>New</span>
          </button>
        )}

        <time className="topbar__date" dateTime={now.toISOString()} title={now.toLocaleTimeString()}>
          <Icon name="calendar" size={13} />
          <span>{dateLabel}</span>
        </time>

        <button
          type="button"
          className="topbar__icon-btn"
          onClick={toggleTheme}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
          <Icon name={isDark ? 'sun' : 'moon'} size={17} />
        </button>

        {onOpenShortcuts && (
          <button
            type="button"
            className="topbar__icon-btn"
            onClick={onOpenShortcuts}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (Press ?)"
          >
            <Icon name="keyboard" size={17} />
          </button>
        )}

        <button
          type="button"
          className="topbar__icon-btn"
          onClick={() => navigate('/settings')}
          aria-label="Open settings"
          title="Settings"
        >
          <Icon name="settings" size={17} />
        </button>
      </div>
    </header>
  )
}

export default TopBar