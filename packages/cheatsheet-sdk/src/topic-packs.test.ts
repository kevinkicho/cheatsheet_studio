import { describe, expect, it } from 'vitest'
import {
  composeTopicPack,
  listTopicPacks,
  loadTopicPack,
} from './topic-packs'
import { validateSheetDocument } from './validate'

describe('topic packs', () => {
  it('lists premade packs', () => {
    const packs = listTopicPacks()
    expect(packs.length).toBeGreaterThanOrEqual(14)
    expect(packs.some((p) => p.id === 'calc-derivatives')).toBe(true)
    expect(packs.some((p) => p.id === 'lin-algebra')).toBe(true)
    expect(packs.some((p) => p.id === 'econ-elasticity')).toBe(true)
    expect(packs.some((p) => p.id === 'bio-genetics')).toBe(true)
    expect(packs.some((p) => p.id === 'finance-npv')).toBe(true)
  })

  it('loads and composes calc-derivatives', async () => {
    const pack = loadTopicPack('calc-derivatives')
    expect(pack.outline.blocks.length).toBeGreaterThan(2)
    const sheet = await composeTopicPack('calc-derivatives')
    expect(validateSheetDocument(sheet).ok).toBe(true)
    expect(sheet.items.length).toBeGreaterThan(3)
  })
})
