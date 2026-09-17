import SettingsPage from './SettingsPage'
import SettingsSection from '../../components/ui/SettingsSection'
import UpdatePanel from '../../components/update/UpdatePanel'

function SettingsUpdates(): React.JSX.Element {
  return (
    <SettingsPage description="Keep the app up to date.">
      <div className="settings-grid">
        <SettingsSection id="s-updates" icon="update" title="Updates" description="Check for and install the latest version.">
          <UpdatePanel />
        </SettingsSection>
      </div>
    </SettingsPage>
  )
}

export default SettingsUpdates