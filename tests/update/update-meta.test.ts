import { describe, expect, it } from 'vitest'
import {
  normalizeFeedUrl,
  parseReleaseNotes,
  safeMessage,
  MAX_RELEASE_NOTES_ITEM_LENGTH,
} from '../../electron/updater/update-meta'

describe('normalizeFeedUrl', () => {
  it('accepts an https feed and strips a trailing slash', () => {
    expect(normalizeFeedUrl('https://example.com/financial-encoder/')).toBe('https://example.com/financial-encoder')
  })

  it('accepts a localhost http feed for testing', () => {
    expect(normalizeFeedUrl('http://127.0.0.1:8080/updates/')).toBe('http://127.0.0.1:8080/updates')
    expect(normalizeFeedUrl('http://localhost:9000')).toBe('http://localhost:9000')
  })

  it('rejects insecure non-local http feeds', () => {
    expect(normalizeFeedUrl('http://evil.example.com/updates')).toBeNull()
  })

  it('rejects garbage input and empty values', () => {
    expect(normalizeFeedUrl('')).toBeNull()
    expect(normalizeFeedUrl('   ')).toBeNull()
    expect(normalizeFeedUrl('file:///c:/temp')).toBeNull()
    expect(normalizeFeedUrl('ftp://example.com/x')).toBeNull()
    expect(normalizeFeedUrl(undefined)).toBeNull()
    expect(normalizeFeedUrl(42)).toBeNull()
    expect(normalizeFeedUrl('not a url')).toBeNull()
  })
})

describe('parseReleaseNotes', () => {
  it('handles a plain string', () => {
    expect(parseReleaseNotes('Bug fixes')).toEqual(['Bug fixes'])
  })

  it('strips HTML tags and honors block boundaries', () => {
    const html = '<h2>v1.1.0</h2><p>Faster OCR</p><ul><li>Fixes</li><li>Speed</li></ul>'
    expect(parseReleaseNotes(html)).toEqual(['v1.1.0', 'Faster OCR', 'Fixes', 'Speed'])
  })

  it('handles the electron-updater array form ({version, note})', () => {
    const raw = [
      { version: '1.1.0', note: '<p>First note</p>' },
      { version: '1.1.1', note: '<p>Second <b>note</b></p>' },
    ]
    expect(parseReleaseNotes(raw)).toEqual(['First note', 'Second note'])
  })

  it('ignores empty entries', () => {
    expect(parseReleaseNotes('')).toEqual([])
    expect(parseReleaseNotes(undefined)).toEqual([])
    expect(parseReleaseNotes(null)).toEqual([])
    expect(parseReleaseNotes([])).toEqual([])
    expect(parseReleaseNotes('   \n  ')).toEqual([])
  })

  it('decodes common HTML entities', () => {
    expect(parseReleaseNotes('Amount &amp; category &lt;all&gt; &#39;quoted&#39;')).toEqual([
      'Amount & category <all> \'quoted\'',
    ])
  })

  it('caps the number of items and their length', () => {
    const many = Array.from({ length: 50 }, (_, i) => `Line ${i}`)
    expect(parseReleaseNotes(many.join('\n'))).toHaveLength(25)
    const huge = `x`.repeat(MAX_RELEASE_NOTES_ITEM_LENGTH + 100)
    const lines = parseReleaseNotes(huge)
    expect(lines[0].length).toBeLessThanOrEqual(MAX_RELEASE_NOTES_ITEM_LENGTH + 1)
    expect(lines[0].endsWith('…')).toBe(true)
  })
})

describe('safeMessage', () => {
  it('collapses whitespace, trims and caps length', () => {
    const long = `  a  b   ${'c'.repeat(300)}  `
    const out = safeMessage(long)
    expect(out).toContain('a b')
    expect(out.length).toBeLessThanOrEqual(201)
    expect(out.endsWith('…')).toBe(true)
  })

  it('handles empty payloads with a fallback', () => {
    expect(safeMessage('')).toBe('The update could not be completed.')
    expect(safeMessage(undefined)).toBe('The update could not be completed.')
    expect(safeMessage(null)).toBe('The update could not be completed.')
    expect(safeMessage(new Error('boom'))).toBe('Error: boom')
  })
})