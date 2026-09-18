import { app, BrowserWindow, dialog, session, shell } from 'electron'
import * as path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { logger } from './services/logger.service'
import { AppError, registerIpcHandler } from './services/ipc-handler'
import { initDatabase, closeDatabase } from './database/connection'
import { createDailyBackupIfDue } from './database/backup.service'
import { registerDatabaseIpcHandlers } from './ipc/database.ipc'
import { registerCategoryIpcHandlers } from './ipc/category.ipc'
import { registerSettingsIpcHandlers } from './ipc/settings.ipc'
import { registerTransactionIpcHandlers } from './ipc/transaction.ipc'
import { registerCalculationIpcHandlers } from './ipc/calculations.ipc'
import { registerImportIpcHandlers } from './ipc/import.ipc'
import { registerExportIpcHandlers } from './export/export.ipc'
import { registerBackupIpcHandlers } from './ipc/backup.ipc'
import { registerOcrIpcHandlers } from './ipc/ocr.ipc'
import { registerUpdaterIpc } from './ipc/updater.ipc'
import { initAutoUpdate } from './updater/update.service'
import { AppInfo, LogLevel, PingResult } from './types/ipc'

// Keep the user-data folder identical between dev and installed builds.
app.setName('Financial Encoder')
// Store all user data under %APPDATA%\Roaming\FinancialEncoder (no spaces),
// matching the documented data path for the release.
if (process.platform === 'win32') {
  app.setPath('userData', path.join(app.getPath('appData'), 'FinancialEncoder'))
}
// Chromium session data stays in its own subfolder so the data root contains
// only the database, backups/, documents/, exports/ and logs/.
app.setPath('sessionData', path.join(app.getPath('userData'), 'cache'))

const isDev = !!process.env.VITE_DEV_SERVER_URL

let mainWindow: BrowserWindow | null = null

const VALID_LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']
const MAX_LOG_MESSAGE_LENGTH = 4000

// Matches the <meta> CSP in index.html and adds a hard response header for
// production file:// loads as defense in depth. Development (Vite server) is
// intentionally left untouched so HMR and React refresh keep working.
const APP_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

function safeLogLevel(value: unknown): LogLevel {
  if (value === 'warning' || value === 'verbose') {
    return value === 'warning' ? 'warn' : 'debug'
  }
  return VALID_LOG_LEVELS.includes(value as LogLevel) ? (value as LogLevel) : 'info'
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Financial Encoder',
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    // In packaged builds the OS reads the icon from the executable; in dev the
    // helper binary icon is used unless we point at the real one explicitly.
    ...(app.isPackaged
      ? {}
      : { icon: path.join(__dirname, '..', 'build', 'icon.ico') }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  // Fallback: if the renderer load is slow or stalls after an auto-update
  // restart, force-show the window after a short delay so the app never
  // remains invisible behind the taskbar.
  let shown = false
  let showTimer: ReturnType<typeof setTimeout> | null = null
  const showWindow = () => {
    if (!shown && window && !window.isDestroyed()) {
      shown = true
      if (showTimer) {
        clearTimeout(showTimer)
        showTimer = null
      }
      window.show()
    }
  }
  window.once('ready-to-show', showWindow)
  window.webContents.once('did-finish-load', showWindow)
  showTimer = setTimeout(showWindow, 4000)

  window.webContents.on('did-finish-load', () => {
    logger.info('renderer loaded', {
      url: isDev && process.env.VITE_DEV_SERVER_URL ? process.env.VITE_DEV_SERVER_URL : 'file://' + path.join(__dirname, '..', 'dist-renderer', 'index.html'),
    })
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error('renderer failed to load', { errorCode, errorDescription, validatedURL })
  })

  // Forward renderer console output into the main log file so errors that
  // happen in the UI are captured on disk, not just the terminal.
  window.webContents.on('console-message', (event) => {
    const level = safeLogLevel(event.level ?? 'info')
    logger[level]('[renderer] ' + event.message)
  })

  window.webContents.on('render-process-gone', (_event, details) => {
    logger.error('renderer process gone', { details })
    if (details.reason !== 'clean-exit' && mainWindow) {
      dialog.showMessageBoxSync(mainWindow, {
        type: 'error',
        title: 'Unexpected error',
        message: 'The application interface stopped responding.',
        detail: 'Your data was not lost. Please restart the application.',
      })
    }
  })

  // Open external links in the user's default browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (isDev && process.env.VITE_DEV_SERVER_URL) {
      const devOrigin = new URL(process.env.VITE_DEV_SERVER_URL).origin
      if (!url.startsWith(devOrigin)) {
        event.preventDefault()
      }
    } else if (!url.startsWith('file://')) {
      event.preventDefault()
    }
  })

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'))
  }

  window.on('closed', () => {
    mainWindow = null
  })

  return window
}

function registerIpcHandlers(): void {
  registerIpcHandler<PingResult>('app:ping', () => {
    return { pong: true, timestamp: new Date().toISOString() }
  })

  registerIpcHandler<AppInfo>('app:get-info', (): AppInfo => {
    return {
      appName: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron ?? 'unknown',
      chromium: process.versions.chrome ?? 'unknown',
      node: process.versions.node ?? 'unknown',
      platform: process.platform,
      userDataPath: app.getPath('userData'),
      logsDir: logger.logsDirPath,
      mode: isDev ? 'development' : 'production',
    }
  })

  registerIpcHandler<{ received: true }>('logger:log', (_event: IpcMainInvokeEvent, level: unknown, message: unknown, context?: unknown) => {
    const lvl = safeLogLevel(level)
    let text = typeof message === 'string' ? message : String(message ?? '')
    text = text.slice(0, MAX_LOG_MESSAGE_LENGTH)
    if (!text) {
      throw new AppError('INVALID_LOG', 'Log message must not be empty.')
    }
    logger[lvl](`[renderer] ${text}`, context ?? undefined)
    return { received: true }
  })

  registerDatabaseIpcHandlers()
  registerSettingsIpcHandlers()
  registerTransactionIpcHandlers()
  registerCategoryIpcHandlers()
  registerCalculationIpcHandlers()
  registerImportIpcHandlers()
  registerExportIpcHandlers()
  registerBackupIpcHandlers()
  registerOcrIpcHandlers()
  registerUpdaterIpc()
}

app.whenReady().then(() => {
  logger.init()
  if (isDev) {
    logger.setLevel('debug')
  }
  logger.info('application starting', {
    version: app.getVersion(),
    electron: process.versions.electron,
    mode: isDev ? 'development' : 'production',
  })

  // Defense in depth: deny <webview> embedding everywhere and never allow any
  // web contents to open windows inside the app.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault()
    })
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https:') || url.startsWith('http:')) {
        shell.openExternal(url)
      }
      return { action: 'deny' }
    })
  })

  // Enforce the Content-Security-Policy header on production file:// loads.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith('file:')) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [APP_CSP],
        },
      })
    } else {
      callback({})
    }
  })

  registerIpcHandlers()
  try {
    initDatabase()
    void createDailyBackupIfDue().catch((err) => {
      logger.warn('automatic startup backup skipped', err instanceof Error ? err.message : String(err))
    })
  } catch (err) {
    logger.error('startup database init failed', err instanceof Error ? { message: err.message } : String(err))
  }
  mainWindow = createMainWindow()
  initAutoUpdate()

  app.on('activate', () => {
    if (mainWindow === null) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase()
    app.quit()
  }
})

process.on('uncaughtException', (error) => {
  logger.error('uncaught exception', {
    name: error.name,
    message: error.message,
    stack: error.stack,
  })
  if (!isDev) {
    app.quit()
  }
})

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection', {
    reason: reason instanceof Error ? { name: reason.name, message: reason.message, stack: reason.stack } : String(reason),
  })
})

process.on('exit', (code) => {
  logger.info(`process exiting with code ${code}`)
})