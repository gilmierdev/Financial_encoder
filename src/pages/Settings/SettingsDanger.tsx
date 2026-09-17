import { useState } from 'react'
import SettingsPage from './SettingsPage'
import SettingsSection from '../../components/ui/SettingsSection'
import TypeToConfirmModal from '../../components/ui/TypeToConfirmModal'
import { logToMain } from '../../services/logger'
import { api, ApiError } from '../../services/api'

function SettingsDanger(): React.JSX.Element {
  const [openConfirm, setOpenConfirm] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetNotice, setResetNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function runResetAllData(): Promise<void> {
    setResetBusy(true)
    setResetNotice(null)
    try {
      await api.db.reset()
      window.location.reload()
    } catch (err) {
      setResetNotice({ kind: 'error', text: (err as ApiError).message ?? 'The data could not be reset.' })
      logToMain('error', 'data reset failed', { message: (err as ApiError).message })
    } finally {
      setResetBusy(false)
    }
  }

  function confirmReset(): void {
    setOpenConfirm(false)
    void runResetAllData()
  }

  return (
    <SettingsPage description="Destructive actions that affect all data.">
      <div className="settings-grid">
        <SettingsSection
          id="s-danger"
          icon="shield"
          title="Danger zone"
          description="Permanently erase all data. This action cannot be undone."
          tone="danger"
        >
          {resetNotice ? (
            <div role="status" className={`notice notice--${resetNotice.kind}`}>
              {resetNotice.text}
            </div>
          ) : null}
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => setOpenConfirm(true)}
            disabled={resetBusy}
          >
            {resetBusy ? 'Resetting\u2026' : 'Reset all data\u2026'}
          </button>
        </SettingsSection>
      </div>

      <TypeToConfirmModal
        open={openConfirm}
        title="Reset All Data"
        message="All financial data will be permanently deleted."
        confirmLabel="Reset All Data"
        requiredText="RESET ALL DATA"
        busy={resetBusy}
        busyLabel="Resetting\u2026"
        onConfirm={confirmReset}
        onCancel={() => setOpenConfirm(false)}
      />
    </SettingsPage>
  )
}

export default SettingsDanger