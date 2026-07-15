import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  packCheatsheetLayout,
  getPackContentBox,
} from './autoOrganize'
import type { CanvasItem, SheetCanvas } from '@/types'

/**
 * Regression metrics for the user-reported export issues:
 * overflow past print box, L1/L2 title stacking, empty space, n-gon steps.
 */
describe('export layout metrics', () => {
  it('Everything md panels ngon L1-2-3: clamp, titles, tetris', () => {
    const sheet = JSON.parse(
      readFileSync(resolve('examples/agent-out/everything.sheet.json'), 'utf8'),
    ) as {
      canvas: SheetCanvas
      items: CanvasItem[]
      folders: Array<{
        id: string
        name?: string
        order?: number
        parentId?: string | null
      }>
    }
    const packed = packCheatsheetLayout(
      sheet.items,
      {
        ...sheet.canvas,
        dissolvePrintArea: true,
        printPageCount: Math.max(8, sheet.canvas.printPageCount ?? 8),
      },
      {
        density: 'md',
        multiPage: true,
        groupByFolder: true,
        folders: sheet.folders,
        fitPrint: true,
        dissolvePrintArea: true,
        groupChrome: 'panels',
        panelShape: 'polygon',
        panelGroupLevels: [1, 2, 3],
        panelBorderLevels: [1, 2, 3],
        panelNgonLevels: [2, 3],
        groupSort: 'name-asc',
        gap: 4,
        panelPadding: 4,
      },
    )
    const box = getPackContentBox(
      {
        ...sheet.canvas,
        dissolvePrintArea: true,
        printPageCount: packed.printPageCount,
      },
      { dissolvePrintArea: true },
    )
    const contentRight = box.left + box.width
    const contentLeft = box.left
    const cards = packed.items.filter((i) => !i.hidden)
    const panels = packed.layoutPanels ?? []
    const stroked = panels.filter((p) => p.showStroke !== false)

    let panelOverflow = 0
    for (const p of stroked) {
      if (p.x + p.width > contentRight + 1 || p.x < contentLeft - 1) {
        panelOverflow++
      }
    }
    let cardOverflow = 0
    for (const c of cards) {
      if (c.x + c.width > contentRight + 1 || c.x < contentLeft - 1) {
        cardOverflow++
      }
    }

    const L1 = panels.filter((p) => (p.hierarchyLevel ?? 1) === 1)
    const L2 = panels.filter((p) => (p.hierarchyLevel ?? 1) === 2)
    let titleStackHits = 0
    for (const outer of L1) {
      const oMembers = new Set(outer.memberIds ?? [])
      for (const inner of L2) {
        if (!inner.memberIds?.every((id) => oMembers.has(id))) continue
        const l1Bot = outer.y + 22
        if (inner.y < l1Bot + 2 && inner.y + 18 > outer.y) titleStackHits++
      }
    }

    let multiRunPolys = 0
    let multiRowPolys = 0
    for (const p of L2) {
      if (p.shape !== 'polygon') continue
      const mem = (p.memberIds ?? [])
        .map((id) => cards.find((c) => c.id === id))
        .filter(Boolean) as CanvasItem[]
      if (mem.length < 2) continue
      const ys = new Set(mem.map((m) => Math.round(m.y / 24) * 24))
      if (ys.size >= 2) {
        multiRowPolys++
        if ((p.runs?.length ?? 0) >= 2) multiRunPolys++
      }
    }

    const cardArea = cards.reduce((s, c) => s + c.width * c.height, 0)
    const spanH =
      Math.max(...cards.map((c) => c.y + c.height)) -
      Math.min(...cards.map((c) => c.y))
    const fill = cardArea / (box.width * Math.max(1, spanH))

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          panelOverflow,
          cardOverflow,
          titleStackHits,
          multiRowPolys,
          multiRunPolys,
          fill: Math.round(fill * 1000) / 1000,
          maxPanelRight: Math.max(...stroked.map((p) => p.x + p.width)),
          contentRight,
          L1: L1.length,
          L2: L2.length,
          printPageCount: packed.printPageCount,
        },
        null,
        2,
      ),
    )

    expect(cardOverflow).toBe(0)
    expect(panelOverflow).toBe(0)
    expect(titleStackHits).toBe(0)
    // At least some multi-row n-gon panels should expose stepped runs
    if (multiRowPolys > 0) {
      expect(multiRunPolys).toBeGreaterThan(0)
    }
    // Cross-topic L1 interleave was the “both rect and n-gon broken” bug —
    // fill collapses when parent separation explodes empty vertical space.
    expect(fill).toBeGreaterThan(0.4)
    expect(packed.printPageCount).toBeLessThanOrEqual(12)
  })
})
