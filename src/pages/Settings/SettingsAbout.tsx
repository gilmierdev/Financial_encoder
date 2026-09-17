import SettingsPage from './SettingsPage'
import SettingsSection from '../../components/ui/SettingsSection'

function SettingsAbout(): React.JSX.Element {
  return (
    <SettingsPage description="About this application.">
      <div className="settings-grid">
        <SettingsSection id="s-about" icon="info" title="About">
          <div className="settings-about">
            <div className="settings-about__brand" aria-hidden="true">FE</div>
            <h3 className="settings-about__name">Financial Encoder</h3>
            <p className="settings-about__label">Developer</p>
            <p className="settings-about__value">GilmierDev</p>
            <p className="settings-about__sublabel">Software &amp; AI Developer</p>
            <p className="settings-about__copyright">© 2026 GilmierDev. All Rights Reserved.</p>
          </div>
        </SettingsSection>
      </div>
    </SettingsPage>
  )
}

export default SettingsAbout