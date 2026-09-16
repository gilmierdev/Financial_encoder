import { createWriteStream, promises as fs } from 'fs'
import * as https from 'https'
import * as path from 'path'
import { app, BrowserWindow, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logger } from '../services/logger.service'
import { normalizeFeedUrl, parseReleaseNotes, friendlyUpdateMessage } from './update-meta'
import type { UpdateStatus } from './update-meta'

const BACKGROUND_CHECK_DELAY_MS = 15_000
const FEED_OVERRIDE_ENV = 'FINANCIAL_ENCODER_UPDATE_FEED'
const UPDATES_RELEASES_URL = 'https://github.com/gilmierdev/financial_encoder/releases/latest'
const SETUP_LATEST_DOWNLOAD_URL = 'https://github.com/gilmierdev/financial_encoder/releases/latest/download'
const MAX_SETUP_DOWNLOAD_REDIRECTS = 5

let status: UpdateStatus = { state: 'unsupported' }
let initialized = false
let checkPromise: Promise<unknown> | null = null
let setupDownloadPromise: Promise<UpdateStatus> | null = null

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
  autoUpdater.autoInstallOnAppQuit = false
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

  autoUpdater.on('error', (err) => {
    logger.error(
      'automatic update error',
      err instanceof Error ? { code: (err as { code?: string }).code, message: err.message, stack: err.stack } : String(err),
    )
    // A network/server failure while checking is soft; let the renderer present
    // an appropriate message. Raw codes and stack traces stay in the log; the
    // banner shows a friendly message.
    const message = friendlyUpdateMessage(err)
    if (status.state === 'available' || status.state === 'setup-downloading' || status.state === 'setup-downloaded') {
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

/**
 * Opens the GitHub releases page in the system browser so the user can download
 * and install the new version manually. Nothing is downloaded or installed by
 * the app itself — the check is notify-only.
 */
export function openReleasesPage(): void {
  void shell.openExternal(UPDATES_RELEASES_URL)
}

/**
 * Streams a URL to a destination file over HTTPS. Follows up to a handful of
 * redirects (GitHub asset URLs bounce to a CDN) and reports byte progress.
 */
function downloadToFile(
  url: string,
  destPath: string,
  onProgress: (transferred: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = (currentUrl: string, redirectsLeft: number): void => {
      const req = https.get(currentUrl, (res) => {
        const statusCode = res.statusCode ?? 0
        const location = res.headers.location
        if (statusCode >= 300 && statusCode < 400 && location) {
          res.resume()
          if (redirectsLeft <= 0) {
            reject(new Error('The setup download redirected too many times.'))
            return
          }
          request(new URL(location, currentUrl).toString(), redirectsLeft - 1)
          return
        }
        if (statusCode !== 200) {
          res.resume()
          reject(new Error(`The setup download failed with HTTP ${statusCode}.`))
          return
        }
        const total = Number(res.headers['content-length']) || 0
        let transferred = 0
        const out = createWriteStream(destPath)
        res.on('data', (chunk) => {
          transferred += chunk.length
          onProgress(transferred, total)
        })
        res.pipe(out)
        out.on('finish', () => out.close(() => resolve()))
        out.on('error', reject)
        res.on('error', reject)
      })
      req.on('error', reject)
    }
    request(url, MAX_SETUP_DOWNLOAD_REDIRECTS)
  })
}

/**
 * Downloads the newest setup installer (`Financial-Encoder-Setup-<version>.exe`)
 * from the GitHub release into the user's Downloads folder. Nothing is run or
 * installed — the user launches the downloaded installer themselves. Progress
 * is delivered via the normal `updater:status` broadcasts.
 */
export async function downloadSetup(): Promise<UpdateStatus> {
  if (!isSupported() || !initialized) {
    return { state: 'unsupported' }
  }
  if (status.state !== 'available') {
    return status
  }
  if (!setupDownloadPromise) {
    const newVersion = status.newVersion
    const downloadsDir = app.getPath('downloads')
    const assetName = `Financial-Encoder-Setup-${newVersion}.exe`
    const finalPath = path.join(downloadsDir, assetName)
    const tempPath = path.join(downloadsDir, `.${assetName}.part`)
    const url = `${SETUP_LATEST_DOWNLOAD_URL}/${assetName}`

    setupDownloadPromise = (async () => {
      try {
        await fs.unlink(tempPath).catch(() => null)
        broadcast({
          state: 'setup-downloading',
          newVersion,
          percent: 0,
          transferred: 0,
          total: 0,
        })
        await downloadToFile(url, tempPath, (transferred, total) => {
          const percent = total > 0 ? Math.round((transferred / total) * 100) : 0
          broadcast({ state: 'setup-downloading', newVersion, percent, transferred, total })
        })
        await fs.rename(tempPath, finalPath)
        const size = (await fs.stat(finalPath)).size
        logger.info('latest setup installer downloaded', { filePath: finalPath, size })
        broadcast({ state: 'setup-downloaded', newVersion, filePath: finalPath, size })
      } catch (err) {
        await fs.unlink(tempPath).catch(() => null)
        logger.error(
          'setup installer download failed',
          err instanceof Error ? { code: (err as { code?: string }).code, message: err.message } : String(err),
        )
        broadcast({
          state: 'error',
          message: 'The setup installer could not be downloaded. Check your internet connection and try again.',
        })
      } finally {
        setupDownloadPromise = null
      }
      return status
    })()
  }
  return setupDownloadPromise
}

/** Reveals a downloaded setup installer in the operating system file explorer. */
export function revealSetupFile(filePath: unknown): void {
  if (typeof filePath === 'string' && filePath.trim() !== '') {
    shell.showItemInFolder(filePath)
  }
}
