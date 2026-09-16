import { app, BrowserWindow, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logger } from '../services/logger.service'
import type { UpdateStatus } from './update-meta'
import { friendlyUpdateMessage, parseReleaseNotes } from './update-meta'

const BACKGROUND_CHECK_DELAY_MS = 15_000

let initialised = false
let currentStatus: UpdateStatus = { state: 'checking' }
let inFlightCheck: Promise<UpdateStatus> | null = null
const listeners = new Set<(s: UpdateStatus) => void>()

function broadcast(status: UpdateStatus): void {
  currentStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:status', status)
    }
  }
  for (const fn of listeners) {
    try { fn(status) } catch { /* listener error ignored */ }
  }
}

export function getUpdateStatus(): UpdateStatus {
  return currentStatus
}

export function onUpdateStatus(callback: (s: UpdateStatus) => void): () => void {
  listeners.add(callback)
  return () => { listeners.delete(callback) }
}

export function checkForUpdates(): UpdateStatus {
  if (!app.isPackaged) {
    const status: UpdateStatus = { state: 'unsupported' }
    broadcast(status)
    return status
  }

  // Share a single in-flight check so concurrent callers (banner mount,
  // settings panel mount and the delayed background check) do not fire
  // several redundant requests or re-broadcast the result.
  if (inFlightCheck) {
    return currentStatus
  }

  broadcast({ state: 'checking' })

  inFlightCheck = autoUpdater
    .checkForUpdates()
    .then((): UpdateStatus => currentStatus)
    .catch((err) => {
      const message = friendlyUpdateMessage(err)
      logger.warn('update check failed', { message })
      broadcast({ state: 'check-failed', message })
      return { state: 'check-failed', message } as UpdateStatus
    })
    .finally(() => {
      inFlightCheck = null
    })

  return currentStatus
}

export function downloadUpdate(): UpdateStatus {
  if (!app.isPackaged) {
    return { state: 'unsupported' }
  }

  if (currentStatus.state === 'downloading' || currentStatus.state === 'downloaded') {
    return currentStatus
  }

  const newVersion = currentStatus.state === 'available' ? currentStatus.newVersion : ''
  broadcast({ state: 'downloading', newVersion, percent: 0, transferred: 0, total: 0 })

  autoUpdater.downloadUpdate().catch((err) => {
    const message = friendlyUpdateMessage(err)
    logger.warn('update download failed', { message })
    broadcast({ state: 'error', message })
  })

  return currentStatus
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}

export function openReleasesPage(): void {
  void shell.openExternal('https://github.com/gilmierdev/financial_encoder/releases/latest')
}

export function initAutoUpdate(): void {
  if (initialised) return
  initialised = true

  if (!app.isPackaged) {
    logger.info('updater disabled in development mode')
    broadcast({ state: 'unsupported' })
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    broadcast({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    const version = info?.version ?? 'unknown'
    const releaseDate = info?.releaseDate ?? new Date().toISOString()
    const notes = parseReleaseNotes(info?.releaseNotes)
    const currentVersion = app.getVersion()

    logger.info('update available', { currentVersion, newVersion: version })
    broadcast({
      state: 'available',
      currentVersion,
      newVersion: version,
      releaseNotes: notes,
      releaseDate,
    })
  })

  autoUpdater.on('update-not-available', () => {
    const currentVersion = app.getVersion()
    logger.info('no update available', { currentVersion })
    broadcast({ state: 'not-available', currentVersion })
  })

  autoUpdater.on('download-progress', (progress) => {
    const newVersion = 'newVersion' in currentStatus ? currentStatus.newVersion : ''
    broadcast({
      state: 'downloading',
      newVersion,
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    const version = info?.version ?? 'unknown'
    const filePath = info?.downloadedFile ?? ''
    const size = info?.files?.[0]?.size ?? 0

    logger.info('update downloaded', { newVersion: version, filePath })
    broadcast({
      state: 'downloaded',
      newVersion: version,
      filePath,
      size,
    })
  })

  autoUpdater.on('error', (err) => {
    const message = friendlyUpdateMessage(err)
    logger.error('updater error', { message })
    broadcast({ state: 'error', message })
  })

  // Delay the first check so the window has time to render.
  setTimeout(() => {
    checkForUpdates()
  }, BACKGROUND_CHECK_DELAY_MS)
}
