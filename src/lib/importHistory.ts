/**
 * Recent agent Import JSON history (localStorage).
 * Helps re-open midterm sheets without hunting Downloads.
 */

export type ImportHistoryEntry = {
  id: string
  title: string
  cardCount: number
  mode: 'new' | 'replace' | 'append'
  at: number
  fileName?: string
}

const KEY = 'cheatsheet.importHistory.v1'
const MAX = 12

export function loadImportHistory(): ImportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ImportHistoryEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e) => e && typeof e.title === 'string').slice(0, MAX)
  } catch {
    return []
  }
}

export function pushImportHistory(
  entry: Omit<ImportHistoryEntry, 'id' | 'at'> & { at?: number },
): ImportHistoryEntry[] {
  const next: ImportHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: entry.title,
    cardCount: entry.cardCount,
    mode: entry.mode,
    at: entry.at ?? Date.now(),
    fileName: entry.fileName,
  }
  const prev = loadImportHistory().filter(
    (e) => e.title !== next.title || e.fileName !== next.fileName,
  )
  const list = [next, ...prev].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* quota */
  }
  return list
}

export function clearImportHistory(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
