/** Tiny id helper (no nanoid dependency in the SDK package). */
export function createId(prefix = 'item'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${rand}`
}
