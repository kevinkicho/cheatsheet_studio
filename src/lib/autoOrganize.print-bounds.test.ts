import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { packCheatsheetLayout, getPackContentBox } from './autoOrganize'
import type { CanvasItem, SheetCanvas } from '@/types'

describe('printable area bounds', () => {
  for (const shape of ['rect', 'polygon'] as const) {
    it(`${shape}: cards and panels stay inside content box (margins excluded)`, () => {
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
      const left = box.left
      const right = box.right
      const cards = packed.items.filter((i) => !i.hidden)
      const panels = (packed.layoutPanels ?? []).filter(
        (p) => p.showStroke !== false,
      )

      const top = box.top
      let cardOut = 0
      let panelOut = 0
      const samples: string[] = []
      for (const c of cards) {
        if (
          c.x < left - 1 ||
          c.x + c.width > right + 1 ||
          c.y < top - 1
        ) {
          cardOut++
          if (samples.length < 6) {
            samples.push(
              `card ${c.id} x=${c.x}..${c.x + c.width} y=${c.y} box=${left}..${right} top=${top}`,
            )
          }
        }
      }
      for (const p of panels) {
        if (
          p.x < left - 1 ||
          p.x + p.width > right + 1 ||
          p.y < top - 1
        ) {
          panelOut++
          if (samples.length < 12) {
            samples.push(
              `panel ${p.title} L${p.hierarchyLevel} x=${p.x}..${p.x + p.width} y=${p.y} w=${p.width}`,
            )
          }
        }
        for (const r of p.runs ?? []) {
          if (
            r.x < left - 1 ||
            r.x + r.width > right + 1 ||
            r.y < top - 1
          ) {
            panelOut++
            if (samples.length < 12) {
              samples.push(
                `run ${p.title} x=${r.x}..${r.x + r.width} y=${r.y}`,
              )
            }
          }
        }
      }
      // eslint-disable-next-line no-console
      console.log(shape, {
        cardOut,
        panelOut,
        left,
        right,
        top,
        maxCardR: Math.max(...cards.map((c) => c.x + c.width)),
        maxPanelR: Math.max(...panels.map((p) => p.x + p.width)),
        minCardX: Math.min(...cards.map((c) => c.x)),
        minPanelX: Math.min(...panels.map((p) => p.x)),
        minCardY: Math.min(...cards.map((c) => c.y)),
        minPanelY: Math.min(...panels.map((p) => p.y)),
        samples,
      })
      expect(cardOut).toBe(0)
      expect(panelOut).toBe(0)
    })
  }
})
