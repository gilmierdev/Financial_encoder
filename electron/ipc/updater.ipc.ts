import { registerIpcHandler } from '../services/ipc-handler'
import { checkForUpdates, downloadSetup, openReleasesPage, revealSetupFile } from '../updater/update.service'

/**
 * Renderer-facing update commands. Status pushes (checking / available /
 * setup-downloading / setup-downloaded / not-available / error) are delivered
 * reactively by the update service via the `updater:status` channel. The app
 * can download the newest installer into the user's Downloads folder; running
 * and installing it is always done manually by the user.
 */
export function registerUpdaterIpc(): void {
  registerIpcHandler('updater:check', () => checkForUpdates())

  registerIpcHandler('updater:download-setup', () => downloadSetup())

  registerIpcHandler('updater:reveal-setup', (_event, filePath: unknown) => {
    revealSetupFile(filePath)
  })

  registerIpcHandler('updater:open-releases', () => {
    openReleasesPage()
  })
}
