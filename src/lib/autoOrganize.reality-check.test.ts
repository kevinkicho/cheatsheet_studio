import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  packCheatsheetLayout,
  getPackContentBox,
  folderAtGroupLevel,
  rectsOverlap,
} from './autoOrganize'
import type { CanvasItem, SheetCanvas } from '@/types'

describe('reality check user complaints', () => {
  it('sm ngon L1-2-3: L1 isolation, tight chrome, content box', () => {
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
    const box = getPackContentBox(
      {
        ...sheet.canvas,
        dissolvePrintArea: true,
        printPageCount: packed.printPageCount,
      },
      { dissolvePrintArea: true },
    )
    const cards = packed.items.filter((i) => !i.hidden && i.folderId)
    const panels = packed.layoutPanels ?? []
    const L1 = panels.filter(
      (p) => (p.hierarchyLevel ?? 1) === 1 && p.showStroke !== false,
    )
    const L2 = panels.filter(
      (p) => (p.hierarchyLevel ?? 1) === 2 && p.showStroke !== false,
    )

    // L1 card AABBs must not interleave
    const byL1 = new Map<string, { name: string; y0: number; y1: number; x0: number; x1: number }>()
    for (const c of cards) {
      const k =
        folderAtGroupLevel(c.folderId, sheet.folders, 1) ?? c.folderId ?? c.id
      const name = sheet.folders.find((f) => f.id === k)?.name ?? k
      const g = byL1.get(k)
      if (!g) {
        byL1.set(k, {
          name,
          y0: c.y,
          y1: c.y + c.height,
          x0: c.x,
          x1: c.x + c.width,
        })
      } else {
        g.y0 = Math.min(g.y0, c.y)
        g.y1 = Math.max(g.y1, c.y + c.height)
        g.x0 = Math.min(g.x0, c.x)
        g.x1 = Math.max(g.x1, c.x + c.width)
      }
    }
    const clusters = [...byL1.values()].sort((a, b) => a.y0 - b.y0)
    let l1Interleave = 0
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i]!
        const b = clusters[j]!
        const xGap = Math.max(a.x0 - b.x1, b.x0 - a.x1)
        if (xGap >= 2) continue // side by side ok
        if (a.y0 < b.y1 && b.y0 < a.y1) {
          l1Interleave++
          // eslint-disable-next-line no-console
          console.log(
            'INTERLEAVE',
            a.name,
            `[${a.y0}-${a.y1}]`,
            b.name,
            `[${b.y0}-${b.y1}]`,
          )
        }
      }
    }

    // L2 chrome waste (panel beyond cards)
    let fatR = 0
    let fatB = 0
    const fatSamples: string[] = []
    for (const p of L2) {
      const mem = (p.memberIds ?? [])
        .map((id) => cards.find((c) => c.id === id))
        .filter(Boolean) as CanvasItem[]
      if (!mem.length) continue
      const maxX = Math.max(...mem.map((m) => m.x + m.width))
      const maxY = Math.max(...mem.map((m) => m.y + m.height))
      const minX = Math.min(...mem.map((m) => m.x))
      const minY = Math.min(...mem.map((m) => m.y))
      const padR = p.x + p.width - maxX
      const padB = p.y + p.height - maxY
      const padL = minX - p.x
      const padT = minY - p.y
      // "Fat" = more than pad+title (~20) empty on right or bottom
      if (padR > 24) fatR++
      if (padB > 24) fatB++
      if ((padR > 24 || padB > 24) && fatSamples.length < 6) {
        fatSamples.push(
          `${p.title} LTRB=${[padL, padT, padR, padB].map(Math.round).join(',')}`,
        )
      }
    }

    // L2 outside L1
    let escape = 0
    for (const o of L1) {
      const set = new Set(o.memberIds ?? [])
      for (const inn of L2) {
        if (!inn.memberIds?.every((id) => set.has(id))) continue
        if (
          inn.x < o.x - 1 ||
          inn.y < o.y - 1 ||
          inn.x + inn.width > o.x + o.width + 1 ||
          inn.y + inn.height > o.y + o.height + 1
        ) {
          escape++
        }
      }
    }

    // L1 panel overlaps
    let l1PanelOl = 0
    for (let i = 0; i < L1.length; i++) {
      for (let j = i + 1; j < L1.length; j++) {
        if (rectsOverlap(L1[i]!, L1[j]!, 0)) l1PanelOl++
      }
    }

    const maxCardR = Math.max(...cards.map((c) => c.x + c.width))
    const report = {
      l1Interleave,
      l1PanelOl,
      escape,
      fatR,
      fatB,
      fatSamples,
      rightSlack: box.right - maxCardR,
      contentBox: { left: box.left, right: box.right, width: box.width },
      clusters: clusters.map((c) => `${c.name} y=${c.y0}-${c.y1}`),
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2))

    // Gaps between successive L1 card bands (should not be huge voids)
    let maxL1Gap = 0
    for (let i = 1; i < clusters.length; i++) {
      const gap = clusters[i]!.y0 - clusters[i - 1]!.y1
      if (gap > maxL1Gap) maxL1Gap = gap
    }

    // eslint-disable-next-line no-console
    console.log({
      maxL1Gap,
      L1shapes: L1.map((p) => p.shape),
      clusters: clusters.map((c) => `${c.name} y=${c.y0}-${c.y1}`),
    })

    expect(l1Interleave).toBe(0)
    expect(escape).toBe(0)
    expect(fatR).toBe(0)
    expect(fatB).toBe(0)
    // Inter-L1 card gap ≤ ~2 cells (48) + pad — not the old 72–150 voids
    expect(maxL1Gap).toBeLessThanOrEqual(48)
    // With nL2-3, L1 must stay rect (not snaking polygon)
    expect(L1.every((p) => p.shape === 'rect')).toBe(true)
  })
})
