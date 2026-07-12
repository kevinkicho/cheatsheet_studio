/** Persist recently picked colors (shared across all color pickers). */

const STORAGE_KEY = 'cheatsheet-recent-colors'
const MAX_RECENT = 10

/** Studio defaults + common accents shown under every color control. */
export const DEFAULT_COLOR_PALETTE: { hex: string; label: string }[] = [
  { hex: '#e8eaed', label: 'Text light' },
  { hex: '#f4f4f5', label: 'Zinc 100' },
  { hex: '#a1a1aa', label: 'Zinc 400' },
  { hex: '#71717a', label: 'Zinc 500' },
  { hex: '#3f3f46', label: 'Zinc 700' },
  { hex: '#27272a', label: 'Node fill' },
  { hex: '#1e2028', label: 'Card fill' },
  { hex: '#0f1115', label: 'Board bg' },
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#818cf8', label: 'Indigo soft' },
  { hex: '#22c55e', label: 'Green' },
  { hex: '#38bdf8', label: 'Sky' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#ffffff', label: 'White' },
  { hex: '#000000', label: 'Black' },
]

function normalizeHex(input: string): string | null {
  const t = input.trim()
  if (!t) return null
  // #rgb → #rrggbb
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const r = t[1]!
    const g = t[2]!
    const b = t[3]!
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase()
  return null
}

export function loadRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((c) => (typeof c === 'string' ? normalizeHex(c) : null))
      .filter((c): c is string => Boolean(c))
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function rememberColor(input: string): string[] {
  const hex = normalizeHex(input)
  if (!hex) return loadRecentColors()
  const prev = loadRecentColors().filter((c) => c !== hex)
  const next = [hex, ...prev].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* quota / private mode */
  }
  // Notify other picker instances in this tab
  window.dispatchEvent(
    new CustomEvent('cheatsheet-recent-colors', { detail: next }),
  )
  return next
}

export function hexForColorInput(value: string | undefined, fallback: string): string {
  if (!value || value === 'mixed' || value === 'transparent') return fallback
  const n = normalizeHex(value)
  if (n) return n
  // Best-effort for simple rgb()
  const m = value.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i,
  )
  if (m) {
    const r = Number(m[1]).toString(16).padStart(2, '0')
    const g = Number(m[2]).toString(16).padStart(2, '0')
    const b = Number(m[3]).toString(16).padStart(2, '0')
    return `#${r}${g}${b}`
  }
  return fallback
}
