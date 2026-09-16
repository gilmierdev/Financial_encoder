import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '../../contexts/SettingsContext'
import { formatDate } from '../../utils/dates'
import { Icon } from '../ui/Icon'

function TopBar(): React.JSX.Element {
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [now, setNow] = useState(() => new Date())
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const dateFormat = settings?.dateFormat ?? 'YYYY-MM-DD'
  const dateLabel = formatDate(now, dateFormat)

  const handleSettingsKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigate('/settings')
    }
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
        <div className="topbar__logo" aria-hidden="true">
          <Icon name="capital" size={16} />
        </div>
        <span className="topbar__app-name">{settings?.appName ?? 'Financial Encoder'}</span>
      </div>

      <form className="topbar__search" role="search" onSubmit={handleSearchSubmit}>
        <span className="topbar__search-icon" aria-hidden="true">
          <Icon name="search" size={16} />
        </span>
        <input
          type="search"
          className="topbar__search-input"
          placeholder="Search transactions…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search transactions"
          spellCheck={false}
        />
        <button type="submit" className="sr-only" aria-label="Search">
          Search
        </button>
      </form>

      <div className="topbar__right">
        <time className="topbar__date" dateTime={now.toISOString()}>
          {dateLabel}
        </time>
        <button
          type="button"
          className="topbar__settings"
          onClick={() => navigate('/settings')}
          onKeyDown={handleSettingsKeyDown}
          aria-label="Open settings"
          title="Settings"
        >
          <Icon name="settings" size={18} />
        </button>
      </div>
    </header>
  )
}

export default TopBar