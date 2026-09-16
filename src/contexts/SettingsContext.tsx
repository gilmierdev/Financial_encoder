import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppSettings } from '../../electron/types/ipc'
import { api, ApiError } from '../services/api'
import { logToMain } from '../services/logger'

interface SettingsContextValue {
  settings: AppSettings | null
  loading: boolean
  error: string | null
  setSetting(key: keyof AppSettings, value: string): Promise<void>
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: null,
  loading: true,
  error: null,
  setSetting: async () => undefined,
})

function applyTheme(theme: AppSettings['theme']): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const effective = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme
  document.documentElement.dataset.theme = effective
}

export function SettingsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.settings
      .getAll()
      .then((loaded) => {
        if (cancelled) {
          return
        }
        setSettings(loaded)
        applyTheme(loaded.theme)
      })
      .catch((err) => {
        if (cancelled) {
          return
        }
        const message = err instanceof ApiError ? err.message : 'Settings could not be loaded.'
        setError(message)
        logToMain('error', 'settings load failed', { message })
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Follow the OS theme while the setting is "system".
  useEffect(() => {
    if (!settings || settings.theme !== 'system') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [settings])

  const setSetting = useCallback(async (key: keyof AppSettings, value: string): Promise<void> => {
    const updated = await api.settings.set(key, value)
    setSettings(updated)
    if (key === 'theme') {
      applyTheme(updated.theme)
    }
  }, [])

  const value = useMemo(
    () => ({ settings, loading, error, setSetting }),
    [settings, loading, error, setSetting],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}