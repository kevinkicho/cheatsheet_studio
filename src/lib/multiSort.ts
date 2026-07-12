/**
 * Multi-column sort helpers (shared by library catalog, equation insert, sheets).
 *
 * Click cycle per column: inactive → asc → desc → remove.
 * Empty levels = original / stable input order.
 */

export type SortDir = 'asc' | 'desc'

export type SortLevel<K extends string = string> = {
  key: K
  dir: SortDir
}

/** Toggle one column in a multi-sort stack. */
export function cycleSortLevel<K extends string>(
  levels: SortLevel<K>[],
  key: K,
): SortLevel<K>[] {
  const i = levels.findIndex((s) => s.key === key)
  if (i === -1) return [...levels, { key, dir: 'asc' }]
  if (levels[i]!.dir === 'asc') {
    return levels.map((s, j) =>
      j === i ? { key, dir: 'desc' as const } : s,
    )
  }
  return levels.filter((_, j) => j !== i)
}

/**
 * Stable multi-key sort. When `levels` is empty, returns `items` unchanged
 * (caller may already have relevance ranking).
 */
export function multiSortStable<T>(
  items: readonly T[],
  levels: readonly SortLevel[],
  compare: (a: T, b: T, key: string) => number,
): T[] {
  if (levels.length === 0 || items.length < 2) return [...items]
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      for (const { key, dir } of levels) {
        const cmp = compare(a.item, b.item, key)
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
      }
      return a.index - b.index
    })
    .map((x) => x.item)
}

export function sortLevelIndex(
  levels: readonly SortLevel[],
  key: string,
): number {
  return levels.findIndex((s) => s.key === key)
}
