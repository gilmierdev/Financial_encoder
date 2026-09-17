import SettingsPage from './SettingsPage'
import SettingsSection from '../../components/ui/SettingsSection'
import { Icon } from '../../components/ui/Icon'
import { useSettings } from '../../contexts/SettingsContext'
import { useSettingSave } from '../../hooks/useSettingSave'

function SettingsAppearance(): React.JSX.Element | null {
  const { settings } = useSettings()
  const { saving, savedKey, notice, save, dismissNotice } = useSettingSave()

  if (!settings) {
    return null
  }

  return (
    <SettingsPage description="Choose a look for the app.">
      {notice ? (
        <div role="status" className="notice notice--error">
          <span>{notice.text}</span>
          <button type="button" className="notice__close" onClick={dismissNotice} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}

      <div className="settings-grid">
        <SettingsSection id="s-appearance" icon="palette" title="Appearance" description="Choose a look for the app.">
          <div className="field">
            <span className="field__label" id="setting-theme-label">Theme</span>
            <div className="field__row" role="group" aria-labelledby="setting-theme-label">
              {([
                { value: 'light' as const, label: 'Light', icon: 'sun' as const },
                { value: 'dark' as const, label: 'Dark', icon: 'moon' as const },
                { value: 'system' as const, label: 'System', icon: 'monitor' as const },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`btn btn--segment settings-theme-btn${settings.theme === opt.value ? ' btn--segment-active' : ''}`}
                  role="radio"
                  aria-checked={settings.theme === opt.value}
                  onClick={() => {
                    if (opt.value !== settings.theme) {
                      void save('theme', opt.value)
                    }
                  }}
                  disabled={saving === 'theme'}
                >
                  <Icon name={opt.icon} size={15} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            <div className="field__status field__status--row" aria-live="polite">
              {saving === 'theme' ? <span className="spinner spinner--xs" aria-label="Saving" /> : null}
              {savedKey === 'theme' ? <span className="field__status-saved">Saved</span> : null}
            </div>
          </div>
        </SettingsSection>
      </div>
    </SettingsPage>
  )
}

export default SettingsAppearance