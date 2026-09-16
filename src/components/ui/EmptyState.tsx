import type { ReactNode } from 'react'
import type { IconName } from './Icon'
import { Icon } from './Icon'

interface EmptyStateProps {
  icon?: IconName
  title: string
  description?: string
  children?: ReactNode
}

function EmptyState({ icon, title, description, children }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="empty-state">
      {icon ? (
        <div className="empty-state__icon" aria-hidden="true">
          <Icon name={icon} size={28} />
        </div>
      ) : null}
      <p className="empty-state__title">{title}</p>
      {description ? <p className="empty-state__description">{description}</p> : null}
      {children ? <div className="empty-state__actions">{children}</div> : null}
    </div>
  )
}

export default EmptyState