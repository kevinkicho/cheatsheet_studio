import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearCatalogCache,
  findCatalogItem,
  listBlocksByType,
  searchBlocks,
  searchCatalog,
  catalogStats,
} from './catalog'
import { createSheet } from './builder'
import { composeFromOutline } from './compose'

describe('Studio blocks catalog', () => {
  beforeEach(() => {
    clearCatalogCache()
  })

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

  it('includes curated process blocks', async () => {
    const procs = await listBlocksByType('process', { limit: 50 })
    expect(procs.length).toBeGreaterThanOrEqual(10)
    expect(procs.every((p) => p.mermaidSource)).toBe(true)
    const npv = await findCatalogItem('proc-npv-screen')
    expect(npv?.type).toBe('process')
    expect(npv?.mermaidKind).toBe('flowchart')
  })

  it('filters process by flowchart vs mindmap', async () => {
    const flows = await searchBlocks({
      type: 'process',
      processKind: 'flowchart',
      limit: 50,
    })
    const maps = await searchBlocks({
      type: 'process',
      processKind: 'mindmap',
      limit: 50,
    })
    expect(flows.every((p) => p.mermaidKind === 'flowchart')).toBe(true)
    expect(maps.every((p) => p.mermaidKind === 'mindmap')).toBe(true)
    expect(maps.length).toBeGreaterThan(0)
  })

  it('lists figures from seed library', async () => {
    const figs = await listBlocksByType('figure', { limit: 20 })
    expect(figs.length).toBeGreaterThan(0)
    expect(figs.every((f) => f.imageUrl)).toBe(true)
  })

  it('catalogStats reports all types', async () => {
    const s = await catalogStats()
    expect(s.equation).toBeGreaterThan(10)
    expect(s.process).toBeGreaterThan(5)
    expect(s.total).toBe(
      (s.equation ?? 0) +
        (s.table ?? 0) +
        (s.figure ?? 0) +
        (s.process ?? 0),
    )
  })

  it('addFromCatalog appends equation card', async () => {
    const sheet = await createSheet({ title: 'Cat' })
      .addFromCatalog('math-quad')
      .then((b) => b.build())
    expect(sheet.items).toHaveLength(1)
    expect(sheet.items[0]!.type).toBe('equation')
    expect(sheet.items[0]!.libraryItemId).toBe('math-quad')
  })

  it('addBlocks pulls equation + process + figure', async () => {
    const figs = await listBlocksByType('figure', { limit: 1 })
    const figId = figs[0]!.id
    const sheet = await createSheet({ title: 'Mixed blocks' })
      .addBlocks(['math-quad', 'proc-npv-screen', figId])
      .then((b) => b.autoLayout().build())
    expect(sheet.items.length).toBe(3)
    expect(sheet.items.some((i) => i.type === 'equation')).toBe(true)
    expect(sheet.items.some((i) => i.type === 'process-chart')).toBe(true)
    expect(sheet.items.some((i) => i.type === 'figure')).toBe(true)
  })

  it('composeFromOutline supports catalog and blocks search', async () => {
    const sheet = await composeFromOutline({
      title: 'With catalog',
      blocks: [
        { type: 'heading', title: 'From seed' },
        { type: 'catalog', id: 'math-quad' },
        { type: 'catalog', ids: ['proc-differentiate'] },
        {
          type: 'blocks',
          query: 'quadratic',
          blockType: 'equation',
          limit: 1,
        },
      ],
    })
    expect(sheet.items.some((i) => i.libraryItemId === 'math-quad')).toBe(true)
    expect(
      sheet.items.some((i) => i.type === 'process-chart' && i.mermaidSource),
    ).toBe(true)
  })
})
