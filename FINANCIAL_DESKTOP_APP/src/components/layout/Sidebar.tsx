import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../../navigation'
import { Icon } from '../ui/Icon'
import { useSettings } from '../../contexts/SettingsContext'

function Sidebar(): React.JSX.Element {
  const { settings } = useSettings()
  const appName = settings?.appName || 'Financial Encoder'

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar__brand">
        <div className="sidebar__logo" aria-hidden="true">
          <Icon name="capital" size={20} />
        </div>
        <span className="sidebar__name">{appName}</span>
      </div>

      <ul className="sidebar__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
              }
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar__footer">
        <span className="sidebar__foot-label">Local / Offline</span>
      </div>
    </nav>
  )
}

export default Sidebar