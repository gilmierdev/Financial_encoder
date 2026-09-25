import { NavLink } from 'react-router-dom'
import { NAV_SECTIONS } from '../../navigation'
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
        <div className="sidebar__brand-text">
          <span className="sidebar__name">{appName}</span>
          <span className="sidebar__version-tag">Local Vault</span>
        </div>
      </div>

      <div className="sidebar__sections">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="sidebar__group">
            <span className="sidebar__group-title">{section.title}</span>
            <ul className="sidebar__list">
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
                    }
                  >
                    <Icon name={item.icon} size={17} />
                    <span className="sidebar__link-label">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="sidebar__footer">
        <div className="sidebar__status">
          <span className="sidebar__status-dot" aria-hidden="true" />
          <span className="sidebar__foot-label">Offline &amp; Encrypted</span>
        </div>
        <span className="sidebar__credit">Financial Encoder Suite</span>
      </div>
    </nav>
  )
}

export default Sidebar