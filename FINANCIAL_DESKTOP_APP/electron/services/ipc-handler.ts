import { logger } from './logger.service'
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcResult } from '../types/ipc'

const UNKNOWN_ERROR_CODE = 'INTERNAL_ERROR'

/**
 * Application-level error with a stable code and a user-friendly message.
 * Technical details (stack traces) are logged separately and are never sent
 * to the renderer.
 */
export class AppError extends Error {
  readonly code: string
  readonly details?: unknown

  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err
  }
  if (err instanceof Error) {
    return new AppError(UNKNOWN_ERROR_CODE, 'An unexpected error occurred.', {
      name: err.name,
      message: err.message,
      stack: err.stack,
    })
  }
  return new AppError(UNKNOWN_ERROR_CODE, 'An unexpected error occurred.', {
    value: String(err),
  })
}

/**
 * Error codes that represent normal, user-initiated aborts rather than real
 * failures. They are still returned to the renderer (which may silently
 * ignore them) but are not logged as errors.
 */
const BENIGN_ERROR_CODES = new Set(['EXPORT_CANCELLED', 'BACKUP_IMPORT_CANCELLED'])

/**
 * Registers an IPC invoke handler that always resolves to a structured
 * IpcResult. Thrown errors are logged with full detail and converted into a
 * safe, user-friendly response that never leaks stack traces into the
 * renderer.
 */
export function registerIpcHandler<T>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => T | Promise<T>,
): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<IpcResult<T>> => {
    try {
      const data = await handler(event, ...args)
      return { ok: true, data }
    } catch (err) {
      const appError = toAppError(err)
      const detail = {
        message: appError.message,
        code: appError.code,
        details: appError.details ?? undefined,
        stack: appError.stack,
      }
      if (BENIGN_ERROR_CODES.has(appError.code)) {
        logger.debug(`ipc:${channel}`, detail)
      } else {
        logger.error(`ipc:${channel}`, detail)
      }
      return { ok: false, error: { code: appError.code, message: appError.message } }
    }
  })
}

export const ipc = { register: registerIpcHandler }