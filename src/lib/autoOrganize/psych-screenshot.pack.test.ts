/**
 * Reproduce Screenshot 2026-07-16 013327 style sheet:
 * COLLECTION / COLLECTION 123 folders + definitions, table, callout, process.
 */
import { describe, it, expect } from 'vitest'
import { packCheatsheetLayout } from './packCheatsheet'
import type { CanvasItem } from '@/types'
import { DEFAULT_CANVAS } from '@/types'

function card(
  id: string,
  partial: Partial<CanvasItem> & { title: string },
): CanvasItem {
  return {
    id,
    type: partial.type ?? 'definition',
    title: partial.title,
    folderId: partial.folderId,
    x: 200 + Math.random() * 600,
    y: 200 + Math.random() * 800,
    width: partial.width ?? 240,
    height: partial.height ?? 140,
    zIndex: 1,
    term: partial.term ?? partial.title,
    body:
      partial.body ??
      'A specialty of psychology that focuses on diagnosing and treating mental, emotional, and behavioral disorders. '.repeat(
        2,
      ),
    latex: partial.latex,
    tableMarkdown: partial.tableMarkdown,
    mermaidSource: partial.mermaidSource,
    processFlow: partial.processFlow as any,
    showTitle: true,
    style: { fontSize: 14, titleFontSize: 10 },
    ...partial,
  } as CanvasItem
}

describe('psych screenshot-like pack', () => {
  const folders = [
    { id: 'col', name: 'COLLECTION', parentId: null, order: 0 },
    { id: 'col123', name: 'COLLECTION 123', parentId: 'col', order: 0 },
    { id: 'cp', name: 'Clinical Psychology', parentId: 'col', order: 1 },
    { id: 'cbt', name: 'CBT', parentId: 'col', order: 2 },
    { id: 'anx', name: 'Anxiety', parentId: 'col', order: 3 },
    { id: 'wm', name: 'Working Memory', parentId: 'col', order: 4 },
  ]

  const items: CanvasItem[] = [
    card('cp1', {
      folderId: 'cp',
      title: 'Clinical Psychology',
      term: 'Clinical Psychology',
      width: 280,
      height: 200,
    }),
    card('cbt1', {
      folderId: 'cbt',
      title: 'Cognitive Behavioral Therapy',
      term: 'CBT',
      body: 'A psycho-social intervention that aims to reduce symptoms of various mental health conditions by challenging and changing cognitive distortions and behaviors.',
      width: 260,
      height: 180,
    }),
    card('proc', {
      folderId: 'cbt',
      title: 'Process chart',
      type: 'process-chart',
      mermaidSource: 'flowchart TD\nA-->B-->C\nB-->D',
      body: '',
      width: 220,
      height: 180,
    }),
    card('ltm', {
      folderId: 'col123',
      title: 'Types of Long-Term Memory',
      type: 'table',
      tableMarkdown:
        '| Type | Description | Example |\n|---|---|---|\n| Declarative | facts | Paris |\n| Episodic | events | birthday |',
      body: '',
      width: 300,
      height: 160,
    }),
    card('anx1', {
      folderId: 'anx',
      title: 'Anxiety vs Fear',
      type: 'table',
      tableMarkdown:
        '| Feature | Fear | Anxiety |\n|---|---|---|\n| Trigger | immediate | future |',
      body: '',
      width: 260,
      height: 120,
    }),
    card('warn', {
      folderId: 'cbt',
      title: 'Confirmation Bias',
      type: 'callout',
      body: 'The tendency to search for, interpret, favor, and recall information in a way that confirms ones preexisting beliefs or hypotheses.',
      width: 200,
      height: 130,
    }),
    card('wm1', {
      folderId: 'wm',
      title: 'Working Memory Model',
      body: 'Baddeley and Hitch multi-component model of temporary storage.',
      width: 200,
      height: 100,
    }),
    card('stern', {
      folderId: 'wm',
      title: "Sternberg's Triarchic Theory",
      body: 'Analytical, creative, practical intelligence.',
      width: 200,
      height: 90,
    }),
    card('miller', {
      folderId: 'wm',
      title: "Miller's Magic Number",
      type: 'equation',
      latex: '7 \\pm 2',
      body: '',
      width: 160,
      height: 70,
    }),
    card('sem', {
      folderId: 'wm',
      title: 'SEM',
      type: 'equation',
      latex: 'SEM = \\sigma\\sqrt{1-r_{xx}}',
      body: '',
      width: 180,
      height: 70,
    }),
  ]

  const packOpts = {
    density: 'sm' as const,
    multiPage: true,
    fitPrint: true,
    groupChrome: 'panels' as const,
    panelShape: 'rect' as const,
    panelGroupLevels: [1, 2, 3] as const,
    panelBorderLevels: [1, 2, 3] as const,
    groupSort: 'name-asc' as const,
    l1PanelGap: 2,
    l2PanelGap: 2,
    blockGap: 2,
    panelPadding: 4,
    folders,
  }

  function countOverlaps(vis: CanvasItem[]) {
    let n = 0
    const pairs: string[] = []
    for (let i = 0; i < vis.length; i++) {
      for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i]!
        const b = vis[j]!
        const xOl =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const yOl =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (xOl > 2 && yOl > 2) {
          n++
          if (pairs.length < 12) {
            pairs.push(
              `${a.title} ∩ ${b.title} @ (${Math.round(xOl)}×${Math.round(yOl)})`,
            )
          }
        }
      }
    }
    return { n, pairs }
  }

  it('produces zero card-card paint overlaps', () => {
    const out = packCheatsheetLayout(
      items,
      { ...DEFAULT_CANVAS, printPageCount: 1 },
      packOpts,
    )
    const vis = out.items.filter((i) => !i.hidden)
    const { n, pairs } = countOverlaps(vis)
    if (n > 0) {
      // eslint-disable-next-line no-console
      console.log('OVERLAPS', pairs)
      // eslint-disable-next-line no-console
      console.log(
        'positions',
        vis.map((i) => ({
          t: i.title,
          x: Math.round(i.x),
          y: Math.round(i.y),
          w: i.width,
          h: i.height,
        })),
      )
    }
    expect(out.layoutPanels.length).toBeGreaterThan(0)
    expect(n).toBe(0)
  })

  it('cards stay finite and mostly inside print band', () => {
    const out = packCheatsheetLayout(
      items,
      { ...DEFAULT_CANVAS, printPageCount: 1 },
      packOpts,
    )
    const vis = out.items.filter((i) => !i.hidden)
    for (const it of vis) {
      expect(Number.isFinite(it.x)).toBe(true)
      expect(Number.isFinite(it.y)).toBe(true)
      expect(it.width).toBeGreaterThan(20)
      expect(it.height).toBeGreaterThan(16)
    }
  })
})
