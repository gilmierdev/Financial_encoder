import PageHeader from './PageHeader'
import EmptyState from './EmptyState'
import type { IconName } from './Icon'

interface UnderConstructionProps {
  title: string
  description: string
  icon: IconName
  phase?: string
}

/** Temporary scaffold used until the module lands in a later phase. */
function UnderConstruction({
  title,
  description,
  icon,
  phase,
}: UnderConstructionProps): React.JSX.Element {
  return (
    <div className="page">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title={`${title} module`}
        description={
          phase
            ? `Under construction. This module is scheduled for ${phase}.`
            : 'Under construction.'
        }
      />
    </div>
  )
}

export default UnderConstruction