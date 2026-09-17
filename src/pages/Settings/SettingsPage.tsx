import type { ReactNode } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import SettingsNav from '../../components/ui/SettingsNav'
import { useSettings } from '../../contexts/SettingsContext'

interface SettingsPageProps {
  title?: string
  description?: string
  children: ReactNode
}

function SettingsPage({ title = 'Settings', description = 'Application preferences.', children }: SettingsPageProps): React.JSX.Element {
  const { loading, error, settings } = useSettings()

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Settings" description="Application preferences." />
        <div className="card"><div className="spinner" aria-label="Loading settings" /></div>
      </div>
    )
  }

  if (error || !settings) {
    return (
      <div className="page">
        <PageHeader title="Settings" description="Application preferences." />
        <div className="card card--error">Settings could not be loaded: {error}</div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader title={title} description={description} />
      <SettingsNav />
      {children}
    </div>
  )
}

export default SettingsPage