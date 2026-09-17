import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
import { app } from 'electron'
import { AppError } from '../services/ipc-handler'
import { logger } from '../services/logger.service'

export interface PaddleOcrLine {
  text: string
  score: number
}

export interface PaddleOcrResult {
  pages: number
  lines: string[]
  text: string
  averageScore: number
}

export interface PaddleRuntime {
  pythonPath: string
  scriptPath: string
  modelsDir: string
}

const OCR_TIMEOUT_MS = 180_000

/**
 * Locates the bundled PaddleOCR runtime. Packaged builds ship the standalone
 * Python runtime + models under resources/ocr-paddle; development uses the
 * project-local ocr-runtime and ocr-sidecar folders.
 */
export function resolvePaddleRuntime(): PaddleRuntime | null {
  const root = app.isPackaged ? path.join(process.resourcesPath, 'ocr-paddle') : app.getAppPath()
  const pythonPath = app.isPackaged
    ? path.join(root, 'python', 'python.exe')
    : path.join(root, 'ocr-runtime', 'python.exe')
  const scriptPath = app.isPackaged
    ? path.join(root, 'paddle_ocr.py')
    : path.join(root, 'ocr-sidecar', 'paddle_ocr.py')
  const modelsDir = app.isPackaged ? path.join(root, 'models') : path.join(root, 'ocr-sidecar', 'models')

  if (!fs.existsSync(pythonPath) || !fs.existsSync(scriptPath)) {
    return null
  }
  return { pythonPath, scriptPath, modelsDir }
}

/** Parses the JSON emitted by the sidecar, surfacing sidecar errors. */
export function parsePaddleOutput(raw: string): PaddleOcrResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new AppError('OCR_FAILED', 'The OCR engine returned an unreadable result.')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new AppError('OCR_FAILED', 'The OCR engine returned an empty result.')
  }
  const data = parsed as Record<string, unknown>
  if (typeof data.error === 'string' && data.error.trim() !== '') {
    throw new AppError('OCR_FAILED', `The OCR engine failed: ${data.error}`)
  }
  const rawLines = Array.isArray(data.lines) ? data.lines : []
  const lines = rawLines
    .map((line) => (typeof line === 'object' && line !== null ? (line as Record<string, unknown>).text : null))
    .filter((text): text is string => typeof text === 'string' && text.trim() !== '')
    .map((text) => text.trim())
  const text = typeof data.text === 'string' && data.text.trim() !== '' ? data.text : lines.join('\n')
  return {
    pages: typeof data.pages === 'number' ? data.pages : lines.length > 0 ? 1 : 0,
    lines,
    text,
    averageScore: typeof data.average_score === 'number' ? data.average_score : 0,
  }
}

/**
 * Runs PaddleOCR on an image or PDF in a bundled Python sidecar. Results are
 * written to a temporary JSON file so library logging can never corrupt them.
 */
export async function runPaddleOcr(filePath: string): Promise<PaddleOcrResult> {
  const runtime = resolvePaddleRuntime()
  if (runtime === null) {
    throw new AppError('OCR_ENGINE_UNAVAILABLE', 'PaddleOCR is not available in this build.')
  }

  const outputPath = path.join(os.tmpdir(), `finenc-paddle-${process.pid}-${Date.now()}.json`)
  const args = [
    runtime.scriptPath,
    '--input',
    filePath,
    '--output',
    outputPath,
    '--lang',
    'en',
    '--models',
    runtime.modelsDir,
  ]

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(runtime.pythonPath, args, {
        windowsHide: true,
        env: {
          ...process.env,
          FLAGS_use_mkldnn: '0',
          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
        },
      })

      let stderr = ''
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      const timer = setTimeout(() => {
        child.kill()
        reject(new AppError('OCR_TIMEOUT', 'The OCR engine took too long to read this document.'))
      }, OCR_TIMEOUT_MS)

      child.on('error', (err) => {
        clearTimeout(timer)
        reject(new AppError('OCR_FAILED', `The OCR engine could not start: ${err.message}`))
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          logger.error('paddleocr sidecar exited with error', { code, stderr: stderr.slice(-2000) })
          reject(new AppError('OCR_FAILED', 'The OCR engine could not read this document.'))
          return
        }
        resolve()
      })
    })

    if (!fs.existsSync(outputPath)) {
      throw new AppError('OCR_FAILED', 'The OCR engine produced no result.')
    }
    return parsePaddleOutput(fs.readFileSync(outputPath, 'utf8'))
  } finally {
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath)
      }
    } catch {
      // best-effort cleanup
    }
  }
}
