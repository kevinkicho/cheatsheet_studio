import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { packCheatsheetLayout } from './autoOrganize'
import type { CanvasItem, SheetCanvas } from '@/types'

function pack(shape: 'rect' | 'polygon') {
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
  return packCheatsheetLayout(
    sheet.items,
    {
      ...sheet.canvas,
      dissolvePrintArea: true,
      printPageCount: 8,
    },
    {
      density: 'sm',
      multiPage: true,
      folders: sheet.folders,
      fitPrint: true,
      dissolvePrintArea: true,
      groupChrome: 'panels',
      panelShape: shape,
      panelGroupLevels: [1, 2, 3],
      panelBorderLevels: [1, 2, 3],
      panelNgonLevels: [2, 3],
      groupSort: 'name-asc',
      gap: 4,
      panelPadding: 4,
    },
  )
}

describe('cards inside panel chrome', () => {
  for (const shape of ['rect', 'polygon'] as const) {
    it(`${shape}: every card is inside every owner panel (pad-aware)`, () => {
      const packed = pack(shape)
      const cards = packed.items.filter((i) => !i.hidden && i.folderId)
      const panels = (packed.layoutPanels ?? []).filter(
        (p) => p.showStroke !== false,
      )
      let overflow = 0
      const samples: string[] = []
      for (const p of panels) {
        const mem = (p.memberIds ?? [])
          .map((id) => cards.find((c) => c.id === id))
          .filter(Boolean) as CanvasItem[]
        // Card must sit inside panel AABB (chrome pad is outside cards)
        for (const c of mem) {
          const eps = 1.5
          if (
            c.x < p.x - eps ||
            c.y < p.y - eps ||
            c.x + c.width > p.x + p.width + eps ||
            c.y + c.height > p.y + p.height + eps
          ) {
            overflow++
            if (samples.length < 10) {
              samples.push(
                `${shape} ${p.title} L${p.hierarchyLevel}: card@(${c.x},${c.y}) ${c.width}x${c.height} panel@(${p.x},${p.y}) ${p.width}x${p.height}`,
              )
            }
          }
        }
        // Also: for n-gon, card must be inside some run (if runs present)
        if (shape === 'polygon' && p.runs && p.runs.length > 0) {
          for (const c of mem) {
            const inRun = p.runs.some(
              (r) =>
                c.x >= r.x - 1 &&
                c.y >= r.y - 1 &&
                c.x + c.width <= r.x + r.width + 1 &&
                c.y + c.height <= r.y + r.height + 1,
            )
            // Soft: title band runs may not cover cards; check content runs only
            const contentRuns = p.runs.filter((r) => r.height > 20)
            if (contentRuns.length === 0) continue
            const inContent = contentRuns.some(
              (r) =>
                c.x >= r.x - 2 &&
                c.y >= r.y - 2 &&
                c.x + c.width <= r.x + r.width + 2 &&
                c.y + c.height <= r.y + r.height + 2,
            )
            if (!inContent && samples.length < 12) {
              samples.push(
                `${shape} RUN-MISS ${p.title}: card ${c.id} not in content runs`,
              )
              overflow++
            }
          }
        }
      }
      // eslint-disable-next-line no-console
      console.log(shape, { overflow, samples })
      expect(overflow).toBe(0)
    })
  }
})
