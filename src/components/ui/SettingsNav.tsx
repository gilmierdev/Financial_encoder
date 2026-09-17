import { NavLink } from 'react-router-dom'
import { SETTINGS_NAV } from '../../pages/Settings/settingsSections'
import { Icon } from './Icon'

function SettingsNav(): React.JSX.Element {
  return (
    <nav className="settings-nav" aria-label="Settings sections">
      {SETTINGS_NAV.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `settings-nav__link${isActive ? ' settings-nav__link--active' : ''}`
          }
        >
          <Icon name={item.icon} size={14} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default SettingsNav