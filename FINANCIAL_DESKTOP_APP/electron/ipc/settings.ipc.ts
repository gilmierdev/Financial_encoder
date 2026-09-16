import { AppError, registerIpcHandler } from '../services/ipc-handler'
import { getAllSettings, isAppSettingKey, setSetting, AppSettings } from '../database/settings'

export function registerSettingsIpcHandlers(): void {
  registerIpcHandler<AppSettings>('settings:get-all', () => {
    return getAllSettings()
  })

  registerIpcHandler<AppSettings>('settings:set', (_event, key: unknown, value: unknown) => {
    if (!isAppSettingKey(key)) {
      throw new AppError('INVALID_SETTING_KEY', 'That setting does not exist.')
    }
    if (typeof value !== 'string') {
      throw new AppError('INVALID_SETTING_VALUE', 'The setting value is invalid.')
    }
    return setSetting(key, value)
  })
}