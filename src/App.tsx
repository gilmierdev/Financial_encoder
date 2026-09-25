import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SettingsProvider } from './contexts/SettingsContext'
import { ToastProvider } from './contexts/ToastContext'
import { api, ApiError } from './services/api'
import { installGlobalErrorForwarding, logToMain } from './services/logger'
import AppShell from './components/layout/AppShell'
import { DEFAULT_SETTINGS_PATH } from './pages/Settings/settingsSections'

const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'))
const Transactions = lazy(() => import('./pages/Transactions/Transactions'))
const Income = lazy(() => import('./pages/Income/Income'))
const Expenses = lazy(() => import('./pages/Expenses/Expenses'))
const Capital = lazy(() => import('./pages/Capital/Capital'))
const CashFlow = lazy(() => import('./pages/CashFlow/CashFlow'))
const Reports = lazy(() => import('./pages/Reports/Reports'))
const Import = lazy(() => import('./pages/Import/Import'))
const Documents = lazy(() => import('./pages/Documents/Documents'))
const SettingsGeneral = lazy(() => import('./pages/Settings/SettingsGeneral'))
const SettingsAppearance = lazy(() => import('./pages/Settings/SettingsAppearance'))
const SettingsUpdates = lazy(() => import('./pages/Settings/SettingsUpdates'))
const SettingsBackups = lazy(() => import('./pages/Settings/SettingsBackups'))
const SettingsAbout = lazy(() => import('./pages/Settings/SettingsAbout'))
const SettingsDanger = lazy(() => import('./pages/Settings/SettingsDanger'))

type BootstrapState =
  | { status: 'loading' }
  | { status: 'ok' }
  | { status: 'error'; message: string }

function BootstrapGate({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<BootstrapState>({ status: 'loading' })

  useEffect(() => {
    installGlobalErrorForwarding()
    let cancelled = false

    async function bootstrap(): Promise<void> {
      try {
        await api.app.getInfo()
        await api.app.ping()
        await api.db.init()
        if (!cancelled) {
          setState({ status: 'ok' })
          logToMain('info', 'bootstrap complete')
        }
      } catch (err) {
        if (cancelled) {
          return
        }
        const message = err instanceof ApiError ? err.message : 'The application interface could not start.'
        setState({ status: 'error', message })
        logToMain('error', 'renderer bootstrap failed', { message })
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') {
    return (
      <div className="boot">
        <div className="boot__card">
          <div className="spinner" aria-label="Loading" />
          <p className="boot__text">Starting Financial Encoder&hellip;</p>
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="boot">
        <div className="boot__card boot__card--error" role="alert">
          <p className="boot__title">The application could not start</p>
          <p className="boot__detail">{state.message}</p>
          <p className="boot__hint">
            A technical record has been written to the application log file.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

function App(): React.JSX.Element {
  return (
    <SettingsProvider>
      <ToastProvider>
        <HashRouter>
          <BootstrapGate>
            <Suspense fallback={<div className="spinner" style={{ margin: '40px auto' }} aria-label="Loading page" />}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/income" element={<Income />} />
                  <Route path="/expenses" element={<Expenses />} />
                  <Route path="/capital" element={<Capital />} />
                  <Route path="/cash-flow" element={<CashFlow />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/import" element={<Import />} />
                  <Route path="/documents" element={<Documents />} />
                  <Route path="/settings" element={<Navigate to={DEFAULT_SETTINGS_PATH} replace />} />
                  <Route path="/settings/general" element={<SettingsGeneral />} />
                  <Route path="/settings/appearance" element={<SettingsAppearance />} />
                  <Route path="/settings/updates" element={<SettingsUpdates />} />
                  <Route path="/settings/backups" element={<SettingsBackups />} />
                  <Route path="/settings/about" element={<SettingsAbout />} />
                  <Route path="/settings/danger" element={<SettingsDanger />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </BootstrapGate>
        </HashRouter>
      </ToastProvider>
    </SettingsProvider>
  )
}

export default App