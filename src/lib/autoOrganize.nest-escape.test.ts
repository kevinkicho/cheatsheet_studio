import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { packCheatsheetLayout } from './autoOrganize'
import type { CanvasItem, SheetCanvas } from '@/types'

describe('nested panel containment', () => {
  it('L2 stroked frames stay inside L1 AABB', () => {
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
        printPageCount: 8,
      },
      {
        density: 'sm',
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
    const panels = packed.layoutPanels ?? []
    const L1 = panels.filter(
      (p) => (p.hierarchyLevel ?? 1) === 1 && p.showStroke !== false,
    )
    const L2 = panels.filter(
      (p) => (p.hierarchyLevel ?? 1) === 2 && p.showStroke !== false,
    )
    let escapes = 0
    const samples: string[] = []
    for (const outer of L1) {
      const set = new Set(outer.memberIds ?? [])
      for (const inner of L2) {
        if (!inner.memberIds?.every((id) => set.has(id))) continue
        const eps = 1.5 // stroke half-width
        const out =
          inner.x < outer.x - eps ||
          inner.y < outer.y - eps ||
          inner.x + inner.width > outer.x + outer.width + eps ||
          inner.y + inner.height > outer.y + outer.height + eps
        if (out) {
          escapes++
          if (samples.length < 8) {
            samples.push(
              `${outer.title} ⊄ ${inner.title}: outer@(${outer.x},${outer.y}) ${outer.width}x${outer.height} inner@(${inner.x},${inner.y}) ${inner.width}x${inner.height}`,
            )
          }
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log({ escapes, samples, L1: L1.length, L2: L2.length })
    expect(escapes).toBe(0)
  })
})
