/**
 * Regression: oversized / sparse panel reflows into residual columns
 * (screenshot 192700 empty bottom-right beside tall process charts).
 */
import { describe, it, expect } from 'vitest'
import { relayoutPanelContents } from './relayout'
import { packIntoBox } from './packIntoBox'
import type { CanvasItem, LayoutPanel } from '@/types'

function card(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<CanvasItem> = {},
): CanvasItem {
  return {
    id,
    type: extra.type ?? 'equation',
    title: id,
    x,
    y,
    width: w,
    height: h,
    zIndex: 1,
    latex: extra.latex ?? 'x',
    folderId: 'calc',
    ...extra,
  }
}

describe('sparse oversized 6.2-like panel', () => {
  // Mimic user: tall process charts stacked with equations BELOW them,
  // panel much wider/taller → large empty bottom-right residual.
  const items: CanvasItem[] = [
    card('mind', 108, 140, 220, 320, {
      type: 'process-chart',
      mermaidSource: 'flowchart TD\nA-->B',
      latex: undefined,
    }),
    card('diff', 108, 470, 200, 280, {
      type: 'process-chart',
      mermaidSource: 'flowchart TD\nA-->B',
      latex: undefined,
    }),
    card('int', 108, 760, 200, 300, {
      type: 'process-chart',
      mermaidSource: 'flowchart TD\nA-->B',
      latex: undefined,
    }),
    card('e1', 108, 1070, 168, 72),
    card('e2', 108, 1150, 168, 72),
    card('e3', 108, 1230, 144, 72),
    card('e4', 108, 1310, 144, 72),
    card('e5', 108, 1390, 192, 72),
    card('e6', 108, 1470, 120, 72),
    card('e7', 108, 1550, 96, 72),
    card('e8', 108, 1630, 168, 72),
    card('e9', 108, 1710, 192, 72),
    card('tbl', 108, 1790, 192, 144, { type: 'table', latex: undefined }),
  ]

  const panel: LayoutPanel = {
    id: 'p-calc',
    title: '6.2 Calculus',
    x: 100,
    y: 100,
    // Wide enough for 2-3 columns; tall enough that stacked layout leaves
    // a huge empty right/bottom region the user can see.
    width: 720,
    height: 900,
    memberIds: items.map((i) => i.id),
    shape: 'rect',
    showTitle: true,
    hierarchyLevel: 2,
    folderId: 'calc',
    contentSort: 'none',
  }

  const folders = [{ id: 'calc', name: '6.2 Calculus', parentId: 'math' }]

  it('packIntoBox fills residual column beside tall cards', () => {
    const packW = panel.width - 8
    const packH = panel.height - 8 - 16
    const r = packIntoBox(items, {
      ox: panel.x + 4,
      oy: panel.y + 4 + 16,
      packW,
      packH,
      gapPx: 2,
      seed: 0,
    })
    const tall = r.placed.filter((c) => c.type === 'process-chart')
    const short = r.placed.filter((c) => c.type !== 'process-chart')
    // At least some short cards should sit beside a tall one (not all below)
    const beside = short.filter((s) =>
      tall.some(
        (t) =>
          s.x >= t.x + t.width - 4 &&
          s.y + s.height <= t.y + t.height + 20 &&
          s.y >= t.y - 4,
      ),
    )
    // eslint-disable-next-line no-console
    console.log('packIntoBox sparse', {
      used: `${r.usedW}x${r.usedH}`,
      pack: `${packW}x${packH}`,
      beside: beside.length,
      short: short.length,
      places: r.placed.map((c) => ({
        id: c.id,
        x: c.x - (panel.x + 4),
        y: c.y - (panel.y + 20),
        w: c.width,
        h: c.height,
      })),
    })
    expect(beside.length).toBeGreaterThanOrEqual(3)
    // Used height much less than pure vertical stack
    const stackH = items.reduce((s, c) => s + c.height + 2, 0)
    expect(r.usedH).toBeLessThan(stackH * 0.55)
  })

  it('full relayoutPanelContents reflows sparse stack into residual', () => {
    const r = relayoutPanelContents(items, panel, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 2,
      panelShape: 'rect',
      folders,
      allPanels: [panel],
      forceFlat: true,
    })
    const mem = r.items.filter((i) => panel.memberIds!.includes(i.id))
    const tall = mem.filter((c) => c.type === 'process-chart')
    const short = mem.filter((c) => c.type !== 'process-chart')
    const beside = short.filter((s) =>
      tall.some(
        (t) =>
          s.x >= t.x + t.width - 4 &&
          s.y + s.height <= t.y + t.height + 20 &&
          s.y >= t.y - 4,
      ),
    )
    const ox = panel.x + 4
    const oy = panel.y + 4 + 16
    const maxY = Math.max(...mem.map((c) => c.y + c.height)) - oy
    const stackH = items.reduce((s, c) => s + c.height + 2, 0)
    // eslint-disable-next-line no-console
    console.log('relayout sparse', {
      beside: beside.length,
      maxY,
      stackH,
      panelH: panel.height,
      places: mem.map((c) => ({
        id: c.id,
        x: Math.round(c.x - ox),
        y: Math.round(c.y - oy),
        w: c.width,
        h: c.height,
      })),
    })
    expect(beside.length).toBeGreaterThanOrEqual(3)
    expect(maxY).toBeLessThan(stackH * 0.55)
    // Panel size locked
    expect(r.panel.width).toBe(panel.width)
    expect(r.panel.height).toBe(panel.height)
    // Cards should move from the stacked layout
    let moved = 0
    for (const c of mem) {
      const o = items.find((i) => i.id === c.id)!
      if (Math.abs(o.x - c.x) > 1 || Math.abs(o.y - c.y) > 1) moved++
    }
    expect(moved).toBeGreaterThanOrEqual(5)
  })

  it('second pack after enlarge still uses residual width', () => {
    // First pack into medium panel
    const medium = { ...panel, width: 480, height: 1100 }
    const r1 = relayoutPanelContents(items, medium, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 2,
      folders,
      allPanels: [medium],
      forceFlat: true,
    })
    // User enlarges panel — more residual to the right
    const wide: LayoutPanel = {
      ...medium,
      width: 800,
      height: 700,
    }
    const r2 = relayoutPanelContents(r1.items, wide, {
      mode: 'dense',
      packSeed: 1,
      panelPad: 4,
      grid: 24,
      blockGapPx: 2,
      folders,
      allPanels: [wide],
      forceFlat: true,
    })
    const mem = r2.items.filter((i) => wide.memberIds!.includes(i.id))
    const maxX = Math.max(...mem.map((c) => c.x + c.width))
    const maxY = Math.max(...mem.map((c) => c.y + c.height))
    const ox = wide.x + 4
    const oy = wide.y + 20
    // Should use substantial width of the enlarged panel
    expect(maxX - ox).toBeGreaterThan(400)
    // And not stay as a thin tall stack
    expect(maxY - oy).toBeLessThan(900)
    // eslint-disable-next-line no-console
    console.log('enlarge reflow', {
      usedW: maxX - ox,
      usedH: maxY - oy,
      packW: wide.width - 8,
      packH: wide.height - 24,
    })
  })
})
