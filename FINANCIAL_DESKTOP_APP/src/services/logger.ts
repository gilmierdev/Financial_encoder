import type { LogLevel } from '../../electron/types/ipc'

let globalForwardingInstalled = false

/**
 * Forwards a renderer log line to the main process so it is written to the
 * local log file. Fire-and-forget: failures are swallowed, logging must never
 * affect the UI path.
 */
export function logToMain(level: LogLevel, message: string, context?: unknown): void {
  if (typeof window.financialEncoder?.logger?.log !== 'function') {
    return
  }
  const safeMessage = String(message).slice(0, 4000)
  void window.financialEncoder.logger.log(level, safeMessage, context).catch(() => undefined)
}

/**
 * Captures uncaught renderer errors and unhandled rejections and writes them
 * to the main-process log file. Installs only once per renderer lifetime.
 */
export function installGlobalErrorForwarding(): void {
  if (globalForwardingInstalled) {
    return
  }
  globalForwardingInstalled = true

  window.addEventListener('error', (event) => {
    logToMain(
      'error',
      event.error instanceof Error ? event.error.message : `Uncaught error: ${event.message}`,
      event.error instanceof Error ? { stack: event.error.stack } : undefined,
    )
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    logToMain(
      'error',
      reason instanceof Error ? reason.message : 'Unhandled promise rejection',
      reason instanceof Error ? { stack: reason.stack } : { value: String(reason).slice(0, 500) },
    )
  })
}