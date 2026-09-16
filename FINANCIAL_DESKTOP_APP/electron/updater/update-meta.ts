/** Pure helpers for the update system. No electron/electron-updater imports
 *  here so they can be unit-tested without a running Electron app. */

export const MAX_RELEASE_NOTES_ITEMS = 25
export const MAX_RELEASE_NOTES_ITEM_LENGTH = 4000
const MAX_ERROR_MESSAGE_LENGTH = 200

/**
 * Discriminated status shared between the main process and the renderer. It
 * drives the update banner UI state machine (available → downloading →
 * downloaded → installing).
 */
export type UpdateStatus =
  | { state: 'unsupported' }
  | { state: 'checking' }
  | { state: 'check-failed'; message: string }
  | {
      state: 'available'
      currentVersion: string
      newVersion: string
      releaseNotes: string[]
      releaseDate: string
    }
  | { state: 'not-available'; currentVersion: string }
  | {
      state: 'downloading'
      percent: number
      transferred: number
      total: number
      bytesPerSecond: number
    }
  | { state: 'downloaded'; newVersion: string }
  | { state: 'installing'; newVersion: string }
  | { state: 'error'; message: string }

/**
 * Accepts an update-feed URL supplied via the environment. Only HTTPS is
 * allowed in normal use; plain HTTP is tolerated solely for local testing
 * (localhost / 127.0.0.1). Everything else is rejected so the app never
 * fetches updates from an arbitrary or insecure host.
 */
export function normalizeFeedUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol === 'https:') {
    return (url.origin + url.pathname).replace(/\/+$/, '')
  }
  const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol === 'http:' && isLocalHost) {
    return (url.origin + url.pathname).replace(/\/+$/, '')
  }
  return null
}

/**
 * Flattens an update-info `releaseNotes` value (a string, a list of
 * {version,note} entries, or nothing) into a list of plain-text bullet lines,
 * with any HTML stripped. Returns an empty array when there is nothing to show.
 */
export function parseReleaseNotes(raw: unknown): string[] {
  let combined = ''

  if (typeof raw === 'string') {
    combined = raw
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      const note = typeof (item as { note?: unknown })?.note === 'string'
        ? (item as { note: string }).note
        : typeof item === 'string'
          ? item
          : ''
      if (note) {
        combined += combined === '' ? note : `\n${note}`
      }
    }
  }

  if (combined.trim() === '') {
    return []
  }

  const plain = combined
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h[1-6][^>]*>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  const lines = plain
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_RELEASE_NOTES_ITEMS)
    .map((line) => (line.length > MAX_RELEASE_NOTES_ITEM_LENGTH ? `${line.slice(0, MAX_RELEASE_NOTES_ITEM_LENGTH)}…` : line))

  return lines
}

/** Collapses an unknown error payload into one safe, short, single-line message. */
export function safeMessage(value: unknown, max = MAX_ERROR_MESSAGE_LENGTH): string {
  const text = typeof value === 'string' ? value : String(value ?? '')
  const condensed = text.replace(/\s+/g, ' ').trim()
  if (condensed === '') {
    return 'The update could not be completed.'
  }
  return condensed.length > max ? `${condensed.slice(0, max)}…` : condensed
}