import { describe, expect, it } from 'vitest'
import { SEED_LIBRARY } from '@/data/seedLibrary'

describe('SEED_LIBRARY integrity', () => {
  it('has unique ids (or documents duplicates for cleanup)', () => {
    const counts = new Map<string, number>()
    for (const item of SEED_LIBRARY) {
      counts.set(item.id, (counts.get(item.id) ?? 0) + 1)
    }
    const dups = [...counts.entries()].filter(([, n]) => n > 1)
    // Prefer uniqueness; if seed still has dups, fail with a clear list
    expect(
      dups,
      `Duplicate seed ids: ${dups.map(([id, n]) => `${id}×${n}`).join(', ')}`,
    ).toEqual([])
  })

  it('every item has required fields', () => {
    for (const item of SEED_LIBRARY) {
      expect(item.id).toBeTruthy()
      expect(item.title).toBeTruthy()
      expect(item.subject).toBeTruthy()
      expect(item.topic).toBeTruthy()
      expect(['equation', 'table', 'figure']).toContain(item.type)
      if (item.type === 'equation') expect(item.latex).toBeTruthy()
      if (item.type === 'table') expect(item.tableMarkdown).toBeTruthy()
      if (item.type === 'figure')
        expect(item.imageUrl || item.latex).toBeTruthy()
    }
  })

  it('includes multiple subjects', () => {
    const subjects = new Set(SEED_LIBRARY.map((i) => i.subject))
    expect(subjects.size).toBeGreaterThan(1)
  })
})
