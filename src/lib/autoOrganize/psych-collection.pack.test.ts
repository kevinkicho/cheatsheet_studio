import { describe, it, expect } from 'vitest'
import { packCheatsheetLayout } from './packCheatsheet'
import type { CanvasItem } from '@/types'
import { DEFAULT_CANVAS } from '@/types'

describe('COLLECTION hierarchy pack (psych-like)', () => {
  it('separates cross-folder paint overlaps (resolveCardOverlaps global)', async () => {
    const { resolveCardOverlaps } = await import('./densify/cardGaps')
    const cards = [
      {
        id: 'a',
        type: 'definition' as const,
        title: 'Clinical Psychology',
        folderId: 'cp',
        x: 48,
        y: 48,
        width: 280,
        height: 200,
        zIndex: 1,
      },
      {
        id: 'b',
        type: 'definition' as const,
        title: 'CBT',
        folderId: 'cbt',
        x: 80,
        y: 80,
        width: 260,
        height: 180,
        zIndex: 2,
      },
    ]
    const out = resolveCardOverlaps(cards as any, {
      grid: 24,
      contentRight: 768,
    })
    const a = out.find((i) => i.id === 'a')!
    const b = out.find((i) => i.id === 'b')!
    const xOl =
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
    const yOl =
      Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
    expect(xOl > 0 && yOl > 0).toBe(false)
  })

  it('does not stack leaf cards on top of each other', () => {
    const folders = [
      { id: 'col', name: 'COLLECTION', parentId: null, order: 0 },
      { id: 'cp', name: 'Clinical Psychology', parentId: 'col', order: 0 },
      { id: 'cbt', name: 'CBT', parentId: 'col', order: 1 },
      { id: 'wm', name: 'Working Memory', parentId: 'col', order: 2 },
      { id: 'mm', name: "Miller's", parentId: 'col', order: 3 },
    ]
    const mk = (
      id: string,
      folderId: string,
      title: string,
      w = 220,
      h = 140,
      type: CanvasItem['type'] = 'definition',
    ): CanvasItem =>
      ({
        id,
        type,
        title,
        folderId,
        x: 100,
        y: 100,
        width: w,
        height: h,
        zIndex: 1,
        latex: type === 'equation' ? 'SEM = \\sigma' : '',
        text: `${title} body `.repeat(10),
        showTitle: true,
        style: { fontSize: 14, titleFontSize: 10 },
      }) as CanvasItem

    const items: CanvasItem[] = [
      mk('a', 'cp', 'Clinical Psychology', 280, 200),
      mk('b', 'cp', 'Types of LTM', 240, 160),
      mk('c', 'cbt', 'CBT', 260, 180),
      mk('d', 'cbt', 'Confirmation Bias', 200, 120, 'callout'),
      mk('e', 'wm', 'Working Memory Model', 200, 100),
      mk('f', 'wm', 'Baddeley', 180, 90),
      mk('g', 'mm', 'Magic Number', 160, 80),
      mk('h', 'mm', 'SEM formula', 180, 70, 'equation'),
    ]

    const out = packCheatsheetLayout(
      items,
      { ...DEFAULT_CANVAS, printPageCount: 1 },
      {
        density: 'sm',
        multiPage: true,
        fitPrint: true,
        groupChrome: 'panels',
        panelShape: 'rect',
        panelGroupLevels: [1, 2, 3],
        panelBorderLevels: [1, 2, 3],
        groupSort: 'name-asc',
        l1PanelGap: 2,
        l2PanelGap: 2,
        blockGap: 2,
        panelPadding: 4,
        folders,
      },
    )

    const vis = out.items.filter((i) => !i.hidden)
    let overlaps = 0
    for (let i = 0; i < vis.length; i++) {
      for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i]!
        const b = vis[j]!
        const xOl =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const yOl =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (xOl > 2 && yOl > 2) overlaps++
      }
    }
    expect(out.layoutPanels.length).toBeGreaterThan(0)
    expect(overlaps).toBe(0)
  })
})
