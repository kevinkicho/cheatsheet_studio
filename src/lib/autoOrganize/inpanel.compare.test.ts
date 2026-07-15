/**
 * Compare sheet densify quality vs in-panel relayout on a realistic fixture.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { packCheatsheetLayout } from './packCheatsheet'
import { relayoutPanelContents } from './panels/relayout'
import type { CanvasItem, LayoutPanel } from '@/types'

function fillRatio(items: CanvasItem[], panel: LayoutPanel) {
  const cards = items.filter(
    (i) => panel.memberIds?.includes(i.id) && !i.hidden,
  )
  if (cards.length === 0) return 0
  const area = cards.reduce((s, c) => s + c.width * c.height, 0)
  const minX = Math.min(...cards.map((c) => c.x))
  const minY = Math.min(...cards.map((c) => c.y))
  const maxX = Math.max(...cards.map((c) => c.x + c.width))
  const maxY = Math.max(...cards.map((c) => c.y + c.height))
  const bbox = Math.max(1, (maxX - minX) * (maxY - minY))
  return { fill: area / bbox, spanW: maxX - minX, spanH: maxY - minY, n: cards.length, area }
}

describe('sheet vs in-panel packing density', () => {
  const path = 'examples/agent-out/everything.sheet.json'
  const has = existsSync(path)

  it.skipIf(!has)('in-panel dense matches or beats sheet leaf density', () => {
    const sheet = JSON.parse(readFileSync(path, 'utf8'))
    const packed = packCheatsheetLayout(
      sheet.items,
      { ...sheet.canvas, dissolvePrintArea: true, printPageCount: 8 },
      {
        density: 'sm',
        multiPage: true,
        folders: sheet.folders,
        fitPrint: true,
        dissolvePrintArea: true,
        groupChrome: 'panels',
        panelShape: 'rect',
        panelGroupLevels: [1, 2],
        panelBorderLevels: [1, 2],
        groupSort: 'name-asc',
        gap: 2,
        l1PanelGap: 2,
        l2PanelGap: 2,
        blockGap: 2,
        panelPadding: 4,
      },
    )
    const panels = packed.layoutPanels ?? []
    // Pick densest L2 with ≥4 cards
    const l2s = panels
      .filter((p) => (p.hierarchyLevel ?? 1) === 2 && (p.memberIds?.length ?? 0) >= 4)
      .map((p) => ({ p, ...fillRatio(packed.items, p) }))
      .sort((a, b) => b.n - a.n)
    expect(l2s.length).toBeGreaterThan(0)
    const target = l2s[0]!
    // eslint-disable-next-line no-console
    console.log('sheet L2', target.p.title, {
      fill: target.fill,
      spanW: target.spanW,
      spanH: target.spanH,
      n: target.n,
      panel: { w: target.p.width, h: target.p.height },
    })

    const r = relayoutPanelContents(packed.items, target.p, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 2,
      l2PanelGapPx: 2,
      panelShape: 'rect',
      folders: sheet.folders,
      allPanels: panels,
    })
    const after = fillRatio(r.items, r.panel)
    // eslint-disable-next-line no-console
    console.log('inpanel L2', {
      fill: after.fill,
      spanW: after.spanW,
      spanH: after.spanH,
      panel: { w: r.panel.width, h: r.panel.height, x: r.panel.x, y: r.panel.y },
    })
    // Origin pinned
    expect(r.panel.x).toBe(target.p.x)
    expect(r.panel.y).toBe(target.p.y)
    // Should not explode height vs sheet bbox by >2.5x
    expect(after.spanH).toBeLessThan(target.spanH * 2.5 + 80)
    // Fill ratio should stay reasonably dense
    expect(after.fill).toBeGreaterThan(0.35)
  })

  it.skipIf(!has)('in-panel L1 hierarchical stays dense', () => {
    const sheet = JSON.parse(readFileSync(path, 'utf8'))
    const packed = packCheatsheetLayout(
      sheet.items,
      { ...sheet.canvas, dissolvePrintArea: true, printPageCount: 8 },
      {
        density: 'sm',
        multiPage: true,
        folders: sheet.folders,
        fitPrint: true,
        dissolvePrintArea: true,
        groupChrome: 'panels',
        panelShape: 'rect',
        panelGroupLevels: [1, 2],
        panelBorderLevels: [1, 2],
        groupSort: 'name-asc',
        gap: 2,
        blockGap: 2,
        l2PanelGap: 4,
        panelPadding: 4,
      },
    )
    const panels = packed.layoutPanels ?? []
    const l1 = panels
      .filter((p) => (p.hierarchyLevel ?? 1) === 1 && (p.memberIds?.length ?? 0) >= 6)
      .sort((a, b) => (b.memberIds?.length ?? 0) - (a.memberIds?.length ?? 0))[0]
    if (!l1) return
    const before = fillRatio(packed.items, l1)
    const r = relayoutPanelContents(packed.items, l1, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 2,
      l2PanelGapPx: 4,
      panelShape: 'rect',
      folders: sheet.folders,
      allPanels: panels,
    })
    const after = fillRatio(r.items, r.panel)
    const l2After = (r.panels ?? panels).filter(
      (p) =>
        (p.hierarchyLevel ?? 1) === 2 &&
        l1.memberIds?.length &&
        p.memberIds?.every((id) => l1.memberIds!.includes(id)),
    )
    // eslint-disable-next-line no-console
    console.log('L1', l1.title, {
      before,
      after,
      origin: [r.panel.x, r.panel.y],
      l2Count: l2After.length,
      l2Sizes: l2After.slice(0, 8).map((p) => ({
        t: p.title,
        w: p.width,
        h: p.height,
        n: p.memberIds?.length,
      })),
    })
    expect(r.panel.x).toBe(l1.x)
    expect(r.panel.y).toBe(l1.y)
    expect(after.fill).toBeGreaterThan(0.35)
    // Should not grow much taller than sheet hierarchical pack
    expect(after.spanH).toBeLessThan(before.spanH * 1.35 + 80)

    // L2 frames under this L1 must not paint-overlap (root cause of user screenshots)
    const l2s = (r.panels ?? panels).filter(
      (p) =>
        (p.hierarchyLevel ?? 1) === 2 &&
        l1.memberIds?.length &&
        p.memberIds?.every((id) => l1.memberIds!.includes(id)),
    )
    for (let i = 0; i < l2s.length; i++) {
      for (let j = i + 1; j < l2s.length; j++) {
        const a = l2s[i]!
        const b = l2s[j]!
        const xOl =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const yOl =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        expect(
          xOl > 2 && yOl > 2,
          `${a.title} overlaps ${b.title}`,
        ).toBe(false)
      }
    }
    // Cards must not overlap
    const cards = r.items.filter(
      (i) => l1.memberIds?.includes(i.id) && !i.hidden,
    )
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i]!
        const b = cards[j]!
        const xOl =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const yOl =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        expect(xOl > 1 && yOl > 1).toBe(false)
      }
    }
  })
})
