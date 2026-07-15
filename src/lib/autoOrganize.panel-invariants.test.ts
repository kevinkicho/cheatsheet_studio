import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  packCheatsheetLayout,
  panelRunsOverlap,
  rectsOverlap,
} from './autoOrganize'
import type { CanvasItem, SheetCanvas } from '@/types'

describe('panel layout invariants', () => {
  for (const shape of ['rect', 'polygon'] as const) {
    it(`${shape}: same-level panels do not overlap; titles clear of cards`, () => {
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
          folders: sheet.folders,
          fitPrint: true,
          dissolvePrintArea: true,
          groupChrome: 'panels',
          panelShape: shape,
          panelGroupLevels: [1, 2, 3],
          panelBorderLevels: [1, 2, 3],
          panelNgonLevels: shape === 'polygon' ? [2, 3] : [],
          groupSort: 'name-asc',
          gap: 4,
          panelPadding: 4,
        },
      )
      const cards = packed.items.filter((i) => !i.hidden)
      const panels = (packed.layoutPanels ?? []).filter(
        (p) => p.showStroke !== false,
      )

      const isNested = (a: (typeof panels)[0], b: (typeof panels)[0]) => {
        if (!a.memberIds?.length || !b.memberIds?.length) return false
        const aSet = new Set(a.memberIds)
        const bSet = new Set(b.memberIds)
        return (
          b.memberIds.every((id) => aSet.has(id)) ||
          a.memberIds.every((id) => bSet.has(id))
        )
      }

      let siblingHits = 0
      const samples: string[] = []
      for (let i = 0; i < panels.length; i++) {
        for (let j = i + 1; j < panels.length; j++) {
          const a = panels[i]!
          const b = panels[j]!
          if ((a.hierarchyLevel ?? 1) !== (b.hierarchyLevel ?? 1)) continue
          if (isNested(a, b)) continue
          if (panelRunsOverlap(a, b, 0) || rectsOverlap(a, b, 0)) {
            siblingHits++
            if (samples.length < 8) {
              samples.push(
                `overlap ${a.title} L${a.hierarchyLevel} × ${b.title} L${b.hierarchyLevel}`,
              )
            }
          }
        }
      }

      let titleHits = 0
      for (const p of panels) {
        if (p.showTitle === false) continue
        // Nested L2 under L1: no exclusive title strip (chip sits under L1 header)
        const nestedUnder = panels.some(
          (o) =>
            o.id !== p.id &&
            (o.hierarchyLevel ?? 1) < (p.hierarchyLevel ?? 1) &&
            o.showStroke !== false &&
            o.memberIds?.length &&
            p.memberIds?.every((id) => o.memberIds!.includes(id)),
        )
        const band =
          (p.hierarchyLevel ?? 1) <= 1 ? 26 : nestedUnder ? 0 : 18
        if (band <= 0) continue
        const titleBot = p.y + band
        for (const id of p.memberIds ?? []) {
          const c = cards.find((x) => x.id === id)
          if (!c) continue
          // Card top edge must sit at or below exclusive title band bottom
          if (c.y < titleBot - 1.5) {
            titleHits++
            if (samples.length < 12) {
              samples.push(
                `title ${p.title}: card y=${c.y} titleBot=${titleBot}`,
              )
            }
          }
        }
      }

      // Nested L2 must sit below L1 exclusive title band (~26px)
      let nestTitleHits = 0
      const L1 = panels.filter((p) => (p.hierarchyLevel ?? 1) === 1)
      const L2 = panels.filter((p) => (p.hierarchyLevel ?? 1) === 2)
      for (const o of L1) {
        const set = new Set(o.memberIds ?? [])
        const l1TitleBot = o.y + 26
        for (const inn of L2) {
          if (!inn.memberIds?.every((id) => set.has(id))) continue
          if (inn.y < l1TitleBot - 1.5) {
            nestTitleHits++
            if (samples.length < 14) {
              samples.push(
                `L2 ${inn.title} y=${inn.y} under L1 ${o.title} titleBot=${l1TitleBot}`,
              )
            }
          }
        }
      }

      // eslint-disable-next-line no-console
      console.log(shape, { siblingHits, titleHits, nestTitleHits, samples })
      expect(siblingHits).toBe(0)
      expect(titleHits).toBe(0)
      expect(nestTitleHits).toBe(0)
    })
  }
})
