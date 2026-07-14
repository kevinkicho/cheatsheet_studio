import { describe, expect, it } from 'vitest'
import {
  composeEverything,
  everythingCatalogStats,
} from './compose-everything'
import type { CanvasItem } from './types'
import { validateSheetDocument } from './validate'

function isBanner(it: CanvasItem): boolean {
  const latex = (it.latex ?? '').trim()
  return (
    it.showTitle === false &&
    latex.includes('\\text{') &&
    latex.length < 160 &&
    !it.tableMarkdown &&
    !it.mermaidSource
  )
}

describe('composeEverything', () => {
  it('builds a multi-folder sheet from a limited catalog slice', async () => {
    const sheet = await composeEverything({
      limit: 25,
      title: 'Test kitchen sink',
    })
    expect(sheet.title).toBe('Test kitchen sink')
    expect(sheet.items.length).toBeGreaterThan(25) // banners + items
    expect(sheet.folders?.length).toBeGreaterThan(0)
    expect(sheet.meta?.source).toBe('composeEverything')
    const v = validateSheetDocument(sheet)
    expect(v.ok).toBe(true)
    // Dense shelf pack: body cards should span multiple x positions (not a single column)
    const bodies = sheet.items.filter(
      (i) => !i.hidden && i.showTitle !== false && !isBanner(i),
    )
    expect(bodies.some((i) => i.x >= 40 && i.y >= 40)).toBe(true)
    const uniqueX = new Set(bodies.map((i) => Math.round(i.x / 40)))
    expect(uniqueX.size).toBeGreaterThan(1)
  }, 30_000)

  it('dense pack places cards side-by-side (not single-column cascade)', async () => {
    const sheet = await composeEverything({ limit: 40 })
    const bodies = sheet.items.filter(
      (i) => !i.hidden && i.showTitle !== false && !isBanner(i),
    )
    const xs = bodies.map((i) => i.x)
    const maxX = Math.max(...xs)
    // Letter content starts ~48; mosaic should reach well past first column
    expect(maxX).toBeGreaterThan(200)
    // At least one pair of cards shares a y-band (side-by-side)
    let sideBySide = false
    for (let i = 0; i < bodies.length && !sideBySide; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]!
        const b = bodies[j]!
        if (Math.abs(a.y - b.y) < 12 && Math.abs(a.x - b.x) > 40) {
          sideBySide = true
          break
        }
      }
    }
    expect(sideBySide).toBe(true)
  }, 30_000)

  it('filters by subject and type', async () => {
    const sheet = await composeEverything({
      subjects: ['finance'],
      types: ['equation'],
      limit: 15,
      noLayout: true,
    })
    const eqs = sheet.items.filter(
      (i) => i.latex && !i.latex.includes('\\textbf{\\text{'),
    )
    expect(eqs.length).toBeGreaterThan(0)
    expect(eqs.length).toBeLessThanOrEqual(15)
  }, 30_000)

  it('everythingCatalogStats reports totals', async () => {
    const stats = await everythingCatalogStats()
    expect(stats.total).toBeGreaterThan(100)
    expect(stats.byType.equation).toBeGreaterThan(0)
    expect(stats.bySubject.mathematics || stats.bySubject.finance).toBeTruthy()
  })
})
