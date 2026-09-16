import { registerIpcHandler } from '../services/ipc-handler'
import { checkForUpdates, downloadUpdate, startInstallUpdate } from '../updater/update.service'

/**
 * Renderer-facing update commands. Status pushes (checking / available /
 * downloading / downloaded / installing / error) are delivered reactively by
 * the update service via the `updater:status` channel.
 */
export function registerUpdaterIpc(): void {
  registerIpcHandler('updater:check', () => checkForUpdates())

  registerIpcHandler('updater:download', () => downloadUpdate())

  // startInstallUpdate returns synchronously so the renderer is acknowledged
  // before the app quits to apply the update.
  registerIpcHandler('updater:install', () => startInstallUpdate())
}