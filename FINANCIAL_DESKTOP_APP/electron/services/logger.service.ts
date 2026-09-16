import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024
const MAX_LOG_FILES = 5

interface PendingEntry {
  level: LogLevel
  message: string
  context?: unknown
}

class LoggerService {
  private logsDir = ''
  private currentPath = ''
  private minLevel: LogLevel = 'debug'
  private initialized = false
  private pending: PendingEntry[] = []

  init(): void {
    if (this.initialized) {
      return
    }
    try {
      const userData = app.getPath('userData')
      this.logsDir = path.join(userData, 'logs')
      fs.mkdirSync(this.logsDir, { recursive: true })
      this.currentPath = path.join(this.logsDir, 'financial-encoder.log')
      this.rotateIfNeeded()
      this.initialized = true

      const queued = this.pending
      this.pending = []
      for (const entry of queued) {
        this.write(entry)
      }
    } catch (err) {
      // Logging must never take the app down; fall back silently if the
      // filesystem is unavailable.
      console.error('[logger] init failed:', err)
    }
  }

  get logsDirPath(): string {
    return this.logsDir
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  debug(message: string, context?: unknown): void {
    this.enqueue('debug', message, context)
  }

  info(message: string, context?: unknown): void {
    this.enqueue('info', message, context)
  }

  warn(message: string, context?: unknown): void {
    this.enqueue('warn', message, context)
  }

  error(message: string, context?: unknown): void {
    this.enqueue('error', message, context)
  }

  private enqueue(level: LogLevel, message: string, context?: unknown): void {
    const entry: PendingEntry = { level, message, context }
    if (!this.initialized) {
      if (this.pending.length < 200) {
        this.pending.push(entry)
      }
      return
    }
    this.write(entry)
  }

  private write(entry: PendingEntry): void {
    if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[this.minLevel]) {
      return
    }
    try {
      const line = this.format(entry)
      // Mirror warnings/errors to the console so a terminal run still shows them.
      if (entry.level === 'error' || entry.level === 'warn') {
        const fn = entry.level === 'error' ? console.error : console.warn
        fn(`[main] ${line}`)
      }
      fs.appendFileSync(this.currentPath, line + '\n')
    } catch (err) {
      console.error('[logger] write failed:', err)
    }
  }

  private format(entry: PendingEntry): string {
    const timestamp = new Date().toISOString()
    const message = entry.message.replace(/\n/g, '\\n').slice(0, 4000)
    if (entry.context === undefined) {
      return `${timestamp} [${entry.level.toUpperCase()}] ${message}`
    }
    let contextText = ''
    try {
      contextText = JSON.stringify(entry.context)
    } catch {
      contextText = String(entry.context)
    }
    if (contextText.length > 2000) {
      contextText = contextText.slice(0, 2000) + '…'
    }
    return `${timestamp} [${entry.level.toUpperCase()}] ${message} ${contextText}`
  }

  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(this.currentPath)) {
        return
      }
      const size = fs.statSync(this.currentPath).size
      if (size < MAX_LOG_SIZE_BYTES) {
        return
      }
      // Shift rotated files: .4 -> discard, .3 -> .4, ... .log -> .1
      for (let i = MAX_LOG_FILES - 1; i >= 1; i -= 1) {
        const from = i === 1 ? this.currentPath : `${this.currentPath}.${i - 1}`
        const to = `${this.currentPath}.${i}`
        if (fs.existsSync(from)) {
          fs.renameSync(from, to)
        }
      }
    } catch (err) {
      console.error('[logger] rotation failed:', err)
    }
  }
}

export const logger = new LoggerService()