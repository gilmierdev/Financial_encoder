import { registerIpcHandler } from '../services/ipc-handler'
import { checkForUpdates, openReleasesPage } from '../updater/update.service'

/**
 * Renderer-facing update commands. Status pushes (checking / available /
 * not-available / error) are delivered reactively by the update service via
 * the `updater:status` channel. The app only notifies; installing a new
 * release happens by opening the GitHub releases page in the browser.
 */
export function registerUpdaterIpc(): void {
  registerIpcHandler('updater:check', () => checkForUpdates())

  registerIpcHandler('updater:open-releases', () => {
    openReleasesPage()
  })
}
