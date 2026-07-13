import { describe, expect, it } from 'vitest'
import {
  composeTopicPack,
  listTopicPacks,
  loadTopicPack,
} from './topic-packs'
import { validateSheetDocument } from './validate'

describe('topic packs', () => {
  it('lists premade packs including flagships', () => {
    const packs = listTopicPacks()
    expect(packs.length).toBeGreaterThanOrEqual(19)
    expect(packs.some((p) => p.id === 'calc-derivatives')).toBe(true)
    expect(packs.some((p) => p.id === 'lin-algebra')).toBe(true)
    expect(packs.some((p) => p.id === 'econ-elasticity')).toBe(true)
    expect(packs.some((p) => p.id === 'bio-genetics')).toBe(true)
    expect(packs.some((p) => p.id === 'finance-npv')).toBe(true)
    expect(packs.some((p) => p.id === 'finance-midterm')).toBe(true)
    expect(packs.some((p) => p.id === 'calc-final')).toBe(true)
    expect(packs.some((p) => p.id === 'stats-midterm')).toBe(true)
    expect(packs.some((p) => p.id === 'micro-midterm')).toBe(true)
  })

  it('loads and composes calc-derivatives', async () => {
    const pack = loadTopicPack('calc-derivatives')
    expect(pack.outline.blocks.length).toBeGreaterThan(2)
    const sheet = await composeTopicPack('calc-derivatives')
    expect(validateSheetDocument(sheet).ok).toBe(true)
    expect(sheet.items.length).toBeGreaterThan(3)
  })

  it('flagship finance-midterm uses Studio blocks (eq + process + figure)', async () => {
    const pack = loadTopicPack('finance-midterm')
    expect(pack.outline.blocks.length).toBeGreaterThan(8)
    const sheet = await composeTopicPack('finance-midterm')
    expect(validateSheetDocument(sheet).ok).toBe(true)
    expect(sheet.title.toLowerCase()).toMatch(/finance|midterm/)
    expect(sheet.items.length).toBeGreaterThan(12)
    const hasEq = sheet.items.some((i) => i.latex)
    const hasTable = sheet.items.some((i) => i.tableMarkdown)
    const hasProcess = sheet.items.some((i) => i.mermaidSource)
    const hasFigure = sheet.items.some((i) => i.imageUrl)
    const catalogLinked = sheet.items.filter((i) => i.libraryItemId).length
    expect(hasEq && hasTable && hasProcess && hasFigure).toBe(true)
    expect(catalogLinked).toBeGreaterThan(8)
    // flowchart + mindmap process kinds
    const kinds = new Set(
      sheet.items
        .filter((i) => i.mermaidKind)
        .map((i) => i.mermaidKind),
    )
    expect(kinds.has('flowchart') || sheet.items.some((i) => i.mermaidSource?.includes('flowchart'))).toBe(true)
    expect(
      sheet.items.some(
        (i) =>
          i.mermaidKind === 'mindmap' ||
          i.mermaidSource?.trimStart().startsWith('mindmap'),
      ),
    ).toBe(true)
  })

  it('calc-final flagship mixes catalog process + figure', async () => {
    const sheet = await composeTopicPack('calc-final')
    expect(validateSheetDocument(sheet).ok).toBe(true)
    expect(sheet.items.some((i) => i.mermaidSource)).toBe(true)
    expect(sheet.items.some((i) => i.imageUrl)).toBe(true)
    expect(sheet.items.filter((i) => i.libraryItemId).length).toBeGreaterThan(5)
  })
})
