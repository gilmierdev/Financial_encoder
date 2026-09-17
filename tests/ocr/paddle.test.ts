import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
  ipcMain: { handle: vi.fn() },
}))

import { parsePaddleOutput } from '../../electron/ocr/paddle.service'

describe('parsePaddleOutput', () => {
  it('extracts lines and text from a successful sidecar result', () => {
    const raw = JSON.stringify({
      engine: 'paddleocr',
      lang: 'en',
      pages: 1,
      lines: [
        { text: 'GCash Bill Payment', score: 0.99 },
        { text: 'PLDT Total 1,707.00', score: 0.98 },
      ],
      text: 'GCash Bill Payment\nPLDT Total 1,707.00',
      average_score: 0.985,
    })

    const result = parsePaddleOutput(raw)
    expect(result.lines).toEqual(['GCash Bill Payment', 'PLDT Total 1,707.00'])
    expect(result.text).toContain('PLDT')
    expect(result.pages).toBe(1)
    expect(result.averageScore).toBeCloseTo(0.985)
  })

  it('throws when the sidecar reports an error', () => {
    const raw = JSON.stringify({ engine: 'paddleocr', error: 'RuntimeError: boom' })
    expect(() => parsePaddleOutput(raw)).toThrowError(/boom/)
  })

  it('throws on unreadable JSON', () => {
    expect(() => parsePaddleOutput('not json')).toThrowError()
  })

  it('derives text from lines and ignores blank entries', () => {
    const raw = JSON.stringify({
      lines: [{ text: 'Alpha', score: 0.9 }, { text: '   ', score: 0.1 }, { text: 'Beta', score: 0.8 }],
    })
    const result = parsePaddleOutput(raw)
    expect(result.lines).toEqual(['Alpha', 'Beta'])
    expect(result.text).toBe('Alpha\nBeta')
  })
})
