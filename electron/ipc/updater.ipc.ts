import { registerIpcHandler } from '../services/ipc-handler'
import { checkForUpdates, downloadUpdate, installUpdate, openReleasesPage } from '../updater/update.service'
import type { UpdateStatus } from '../updater/update-meta'

/**
 * Renderer-facing update commands. Status pushes (checking / available /
 * downloading / downloaded / not-available / error) are delivered
 * reactively by the update service via the `updater:status` channel.
 */
export function registerUpdaterIpc(): void {
  registerIpcHandler<UpdateStatus>('updater:check', () => checkForUpdates())

  registerIpcHandler<UpdateStatus>('updater:download', () => downloadUpdate())

  registerIpcHandler<void>('updater:install', () => {
    installUpdate()
  })

  registerIpcHandler<void>('updater:open-releases', () => {
    openReleasesPage()
  })
}
