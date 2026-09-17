import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../electron/types/ipc'
import { useSettings } from '../contexts/SettingsContext'
import { ApiError } from '../services/api'
import { logToMain } from '../services/logger'

const SETTING_LABELS: Partial<Record<keyof AppSettings, string>> = {
  currency: 'Currency',
  dateFormat: 'Date format',
  theme: 'Theme',
}

export interface SaveNotice {
  kind: 'error'
  text: string
}

export interface UseSettingSave {
  saving: keyof AppSettings | null
  savedKey: keyof AppSettings | null
  notice: SaveNotice | null
  save(key: keyof AppSettings, value: string): Promise<void>
  dismissNotice(): void
}

export function useSettingSave(): UseSettingSave {
  const { setSetting } = useSettings()
  const [saving, setSaving] = useState<keyof AppSettings | null>(null)
  const [savedKey, setSavedKey] = useState<keyof AppSettings | null>(null)
  const [notice, setNotice] = useState<SaveNotice | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (savedTimer.current) clearTimeout(savedTimer.current) }
  }, [])

  const save = async (key: keyof AppSettings, value: string): Promise<void> => {
    setSaving(key)
    setSavedKey(null)
    setNotice(null)
    if (savedTimer.current) { clearTimeout(savedTimer.current); savedTimer.current = null }
    try {
      await setSetting(key, value)
      setSavedKey(key)
      savedTimer.current = setTimeout(() => setSavedKey(null), 2200)
    } catch (err) {
      const message = (err as ApiError).message ?? 'Settings could not be saved.'
      setNotice({ kind: 'error', text: `${SETTING_LABELS[key] ?? key} could not be saved. ${message}` })
      logToMain('error', 'settings save failed', { key, message })
    } finally {
      setSaving(null)
    }
  }

  const dismissNotice = (): void => setNotice(null)

  return { saving, savedKey, notice, save, dismissNotice }
}