import { describe, expect, it } from 'vitest'
import { findCatalogItem, searchCatalog } from './catalog'
import { createSheet } from './builder'
import { composeFromOutline } from './compose'

describe('seed catalog (monorepo)', () => {
  it('finds quadratic formula by id', async () => {
    const item = await findCatalogItem('math-quad')
    expect(item).not.toBeNull()
    expect(item!.type).toBe('equation')
    expect(item!.latex).toBeTruthy()
  })

  it('searchCatalog finds algebra hits', async () => {
    const hits = await searchCatalog({ query: 'quadratic', limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((h) => h.id === 'math-quad')).toBe(true)
  })

  it('addFromCatalog appends equation card', async () => {
    const sheet = await createSheet({ title: 'Cat' })
      .addFromCatalog('math-quad')
      .then((b) => b.build())
    expect(sheet.items).toHaveLength(1)
    expect(sheet.items[0]!.type).toBe('equation')
    expect(sheet.items[0]!.libraryItemId).toBe('math-quad')
  })

  it('composeFromOutline supports catalog blocks', async () => {
    const sheet = await composeFromOutline({
      title: 'With catalog',
      blocks: [
        { type: 'heading', title: 'From seed' },
        { type: 'catalog', id: 'math-quad' },
      ],
    })
    expect(sheet.items.some((i) => i.libraryItemId === 'math-quad')).toBe(true)
  })
})
