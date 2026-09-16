import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { AppError } from '../services/ipc-handler'
import { logger } from '../services/logger.service'
import { createBackup } from '../database/backup.service'
import { normalizeFeedUrl, parseReleaseNotes, friendlyUpdateMessage } from './update-meta'
import type { UpdateStatus } from './update-meta'

const BACKGROUND_CHECK_DELAY_MS = 15_000
const FEED_OVERRIDE_ENV = 'FINANCIAL_ENCODER_UPDATE_FEED'

let status: UpdateStatus = { state: 'unsupported' }
let initialized = false
let checkPromise: Promise<unknown> | null = null
let downloadPromise: Promise<unknown> | null = null

/** Sends the latest update state to every open renderer window. */
function broadcast(next: UpdateStatus): void {
  status = next
  let sentTo = 0
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:status', next)
      sentTo += 1
    }
  }
  logger.debug('updater status broadcast', { state: next.state, sentTo })
}

/**
 * Auto-update is only available in packaged Windows builds. In development the
 * updater stays inert so HMR/package.json version churn never triggers it.
 */
function isSupported(): boolean {
  return app.isPackaged && process.platform === 'win32'
}

function setup(): void {
  if (initialized) {
    return
  }
  initialized = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false

  // The update source is baked in at build time (app-update.yml from the
  // electron-builder `publish` block). An explicit environment override is
  // honoured only for testing against a local HTTPS (or localhost) feed; it is
  // never configurable from the renderer or by the user at runtime.
  const feed = normalizeFeedUrl(process.env[FEED_OVERRIDE_ENV])
  if (feed) {
    autoUpdater.setFeedURL({ provider: 'generic', url: feed })
    logger.info('update feed overridden for testing', { url: feed })
  }

  autoUpdater.on('checking-for-update', () => {
    broadcast({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    broadcast({
      state: 'available',
      currentVersion: app.getVersion(),
      newVersion: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate ?? '',
    })
  })

  autoUpdater.on('update-not-available', () => {
    broadcast({ state: 'not-available', currentVersion: app.getVersion() })
  })

  autoUpdater.on('download-progress', (progress) => {
    broadcast({
      state: 'downloading',
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ state: 'downloaded', newVersion: info.version })
  })

  autoUpdater.on('error', (err) => {
    logger.error(
      'automatic update error',
      err instanceof Error ? { code: (err as { code?: string }).code, message: err.message, stack: err.stack } : String(err),
    )
    // A network/server failure while checking is softer than a failure while
    // applying; let the renderer present the appropriate message. Raw codes
    // and stack traces stay in the log; the banner shows a friendly message.
    const message = friendlyUpdateMessage(err)
    if (status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded') {
      broadcast({ state: 'error', message })
    } else {
      broadcast({ state: 'check-failed', message })
    }
  })
}

/** Called once at startup. Schedules a background version check for later. */
export function initAutoUpdate(): void {
  if (!isSupported()) {
    status = { state: 'unsupported' }
    logger.info('automatic updates disabled', { mode: app.isPackaged ? 'non-windows' : 'development build' })
    return
  }
  setup()
  logger.info('automatic updates enabled', { currentVersion: app.getVersion() })
  setTimeout(() => {
    void checkForUpdates().catch(() => undefined)
  }, BACKGROUND_CHECK_DELAY_MS)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

/** Checks the release feed. Multiple rapid calls share a single in-flight check. */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!isSupported() || !initialized) {
    return { state: 'unsupported' }
  }
  if (!checkPromise) {
    checkPromise = autoUpdater.checkForUpdates().catch(() => undefined)
  }
  try {
    await checkPromise
  } finally {
    checkPromise = null
  }
  return status
}

/** Downloads a previously announced update. Progress arrives via events. */
export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!isSupported() || !initialized) {
    return { state: 'unsupported' }
  }
  if (status.state !== 'available') {
    return status
  }
  if (!downloadPromise) {
    downloadPromise = autoUpdater.downloadUpdate().catch(() => undefined)
  }
  try {
    await downloadPromise
  } finally {
    downloadPromise = null
  }
  return status
}

/**
 * Starts the apply-and-restart flow. Returns the new status synchronously so
 * the calling IPC handler can acknowledge the renderer before the app quits.
 * The safety backup runs asynchronously and always completes before the
 * installer is launched — the installer only replaces files in the
 * application/install directory; the user-data folder (database, backups,
 * settings, preferences) is never deleted or overwritten by the update.
 */
export function startInstallUpdate(): UpdateStatus {
  if (!isSupported() || !initialized) {
    return { state: 'unsupported' }
  }
  if (status.state !== 'downloaded') {
    throw new AppError('UPDATE_NOT_READY', 'The update has not finished downloading yet.')
  }
  const newVersion = status.newVersion
  broadcast({ state: 'installing', newVersion })

  void (async () => {
    try {
      const backup = await createBackup()
      logger.info('safety backup created before update', { filename: backup.filename })
    } catch (err) {
      logger.warn('safety backup before update failed (proceeding anyway)', err instanceof Error ? err.message : String(err))
    }
    // Silent install, then relaunch the newly updated app.
    autoUpdater.quitAndInstall(true, true)
  })()

  return { state: 'installing', newVersion }
}