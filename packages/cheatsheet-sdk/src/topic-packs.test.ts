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

  it('flagship finance-midterm pack composes a full midterm sheet', async () => {
    const pack = loadTopicPack('finance-midterm')
    expect(pack.outline.blocks.length).toBeGreaterThan(10)
    const sheet = await composeTopicPack('finance-midterm')
    expect(validateSheetDocument(sheet).ok).toBe(true)
    expect(sheet.title.toLowerCase()).toMatch(/finance|midterm/)
    expect(sheet.items.length).toBeGreaterThan(8)
    const hasEq = sheet.items.some((i) => i.type === 'equation' || i.latex)
    const hasTable = sheet.items.some((i) => i.type === 'table' || i.tableMarkdown)
    const hasProcess = sheet.items.some(
      (i) => i.type === 'process-chart' || i.mermaidSource,
    )
    expect(hasEq && hasTable && hasProcess).toBe(true)
  })
})
