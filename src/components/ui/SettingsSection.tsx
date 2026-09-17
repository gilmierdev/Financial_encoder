import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface SettingsSectionProps {
  id?: string
  icon: IconName
  title: string
  description?: string
  actions?: ReactNode
  tone?: 'default' | 'danger'
  children: ReactNode
}

function SettingsSection({
  id,
  icon,
  title,
  description,
  actions,
  tone = 'default',
  children,
}: SettingsSectionProps): React.JSX.Element {
  return (
    <section id={id} className={`card settings-section${tone === 'danger' ? ' settings-section--danger' : ''}`}>
      <header className="settings-section__head">
        <div className="settings-section__head-main">
          <span className="settings-section__icon" aria-hidden="true">
            <Icon name={icon} size={18} />
          </span>
          <div className="settings-section__head-text">
            <h2 className="settings-section__title">{title}</h2>
            {description ? <p className="settings-section__desc">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="settings-section__actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  )
}

export default SettingsSection