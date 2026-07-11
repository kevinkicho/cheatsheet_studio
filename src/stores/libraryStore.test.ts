import { beforeEach, describe, expect, it } from 'vitest'
import { useLibraryStore } from '@/stores/libraryStore'
import { SEED_LIBRARY } from '@/data/seedLibrary'

describe('libraryStore (seed mode, no network)', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      items: SEED_LIBRARY,
      loading: false,
      source: 'seed',
    })
  })

  it('starts with seed library', () => {
    expect(useLibraryStore.getState().items.length).toBeGreaterThan(0)
    expect(useLibraryStore.getState().source).toBe('seed')
  })

  it('getById finds seed items', () => {
    const first = SEED_LIBRARY[0]!
    expect(useLibraryStore.getState().getById(first.id)?.title).toBe(
      first.title,
    )
    expect(useLibraryStore.getState().getById('missing-id')).toBeUndefined()
  })

  it('bySubject filters', () => {
    const math = useLibraryStore.getState().bySubject('mathematics')
    expect(math.length).toBeGreaterThan(0)
    expect(math.every((i) => i.subject === 'mathematics')).toBe(true)
  })

  it('topicsFor returns sorted unique topics', () => {
    const topics = useLibraryStore.getState().topicsFor('mathematics')
    expect(topics.length).toBeGreaterThan(0)
    const sorted = [...topics].sort()
    expect(topics).toEqual(sorted)
    expect(new Set(topics).size).toBe(topics.length)
  })
})
