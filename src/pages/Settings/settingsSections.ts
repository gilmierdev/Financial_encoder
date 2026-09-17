import type { IconName } from '../../components/ui/Icon'

export interface SettingsNavItem {
  path: string
  label: string
  icon: IconName
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  { path: '/settings/general', label: 'General', icon: 'globe' },
  { path: '/settings/appearance', label: 'Appearance', icon: 'palette' },
  { path: '/settings/updates', label: 'Updates', icon: 'update' },
  { path: '/settings/backups', label: 'Backups', icon: 'archive' },
  { path: '/settings/about', label: 'About', icon: 'info' },
  { path: '/settings/danger', label: 'Danger zone', icon: 'shield' },
]

export const DEFAULT_SETTINGS_PATH = '/settings/general'