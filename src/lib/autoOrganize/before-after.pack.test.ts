/**
 * Reproduce user before/after screenshots (014214 → 014234):
 * Clean manual panels (COLLECTION, DDD, COLLECTION 123) + process mindmap
 * destroyed by sheet Apply auto-layout.
 */
import { describe, it, expect } from 'vitest'
import { packCheatsheetLayout } from './packCheatsheet'
import type { CanvasItem, LayoutPanel } from '@/types'
import { DEFAULT_CANVAS } from '@/types'

const folders = [
  { id: 'col', name: 'COLLECTION', parentId: null, order: 0 },
  { id: 'col123', name: 'COLLECTION 123', parentId: null, order: 1 },
  { id: 'ddd', name: 'DDD', parentId: null, order: 2 },
  // Nested under COLLECTION? Screenshot shows Clinical+CBT inside COLLECTION
  { id: 'cp', name: 'Clinical Psychology', parentId: 'col', order: 0 },
  { id: 'cbt', name: 'CBT', parentId: 'col', order: 1 },
]

function def(
  id: string,
  folderId: string | null,
  title: string,
  body: string,
  x: number,
  y: number,
  w = 240,
  h = 140,
): CanvasItem {
  return {
    id,
    type: 'definition',
    title,
    term: title,
    body,
    folderId: folderId ?? undefined,
    x,
    y,
    width: w,
    height: h,
    zIndex: 1,
    showTitle: true,
    style: { fontSize: 14, titleFontSize: 10 },
  } as CanvasItem
}

function table(
  id: string,
  folderId: string | null,
  title: string,
  md: string,
  x: number,
  y: number,
): CanvasItem {
  return {
    id,
    type: 'table',
    title,
    tableMarkdown: md,
    folderId: folderId ?? undefined,
    x,
    y,
    width: 280,
    height: 140,
    zIndex: 1,
    showTitle: true,
    style: { fontSize: 13, titleFontSize: 10 },
  } as CanvasItem
}

function callout(
  id: string,
  folderId: string | null,
  title: string,
  body: string,
  x: number,
  y: number,
): CanvasItem {
  return {
    id,
    type: 'callout',
    title,
    body,
    folderId: folderId ?? undefined,
    x,
    y,
    width: 200,
    height: 130,
    zIndex: 1,
    showTitle: true,
    style: { fontSize: 13, titleFontSize: 10 },
  } as CanvasItem
}

function eq(
  id: string,
  folderId: string | null,
  title: string,
  latex: string,
  x: number,
  y: number,
): CanvasItem {
  return {
    id,
    type: 'equation',
    title,
    latex,
    folderId: folderId ?? undefined,
    x,
    y,
    width: 180,
    height: 70,
    zIndex: 1,
    showTitle: true,
    style: { fontSize: 16, titleFontSize: 10 },
  } as CanvasItem
}

const mindmapSource = `mindmap
  root((mindmap))
    Tools
      Pen and paper
      Mermaid
    Origins
      Long history
      Popularisation
    Research
      On Automatic creation
    Uses
      Argument mapping
      Strategic planning
      Creative techniques
`

function processChart(x: number, y: number): CanvasItem {
  return {
    id: 'proc1',
    type: 'process-chart',
    title: 'PROCESS CHART',
    mermaidSource: mindmapSource,
    mermaidKind: 'mindmap',
    folderId: undefined, // ungrouped in before shot
    x,
    y,
    width: 360,
    height: 280,
    zIndex: 2,
    showTitle: true,
    processFlow: {
      v: 1,
      direction: 'TD',
      curveStyle: 'basis',
      diagramKind: 'mindmap',
      width: 500,
      height: 400,
      nodes: [
        {
          id: 'root',
          x: 200,
          y: 150,
          width: 100,
          height: 100,
          label: 'mindmap',
          shape: 'circle',
        },
        {
          id: 'tools',
          x: 80,
          y: 40,
          width: 80,
          height: 48,
          label: 'Tools',
          shape: 'rounded',
        },
        {
          id: 'origins',
          x: 320,
          y: 40,
          width: 80,
          height: 48,
          label: 'Origins',
          shape: 'rounded',
        },
      ],
      edges: [
        { id: 'e1', source: 'root', target: 'tools' },
        { id: 'e2', source: 'root', target: 'origins' },
      ],
    },
    style: { fontSize: 14, titleFontSize: 10 },
  } as CanvasItem
}

/** Approximate before-screenshot layout (manual org). */
const beforeItems: CanvasItem[] = [
  def(
    'cp',
    'cp',
    'Clinical Psychology',
    'A specialty of psychology that focuses on diagnosing and treating mental, emotional, and behavioral disorders.',
    60,
    60,
    260,
    160,
  ),
  def(
    'cbt',
    'cbt',
    'Cognitive Behavioral Therapy',
    'A psycho-social intervention that aims to reduce symptoms of various mental health conditions by challenging and changing cognitive distortions and behaviors.',
    340,
    60,
    280,
    160,
  ),
  def(
    'bpd',
    null,
    'Borderline Personality Disorder',
    'A pattern of instability in interpersonal relationships, self-image, and affects, often accompanied by marked impulsivity.',
    700,
    60,
    260,
    150,
  ),
  table(
    'anx',
    'ddd',
    'Anxiety vs Fear',
    '| Feature | Fear | Anxiety |\n|---|---|---|\n| Trigger | Immediate | Future |\n| Duration | Short | Long |',
    60,
    280,
  ),
  eq('sem', 'ddd', 'SEM', 'SEM = \\sigma\\sqrt{1-r_{xx}}', 80, 440),
  table(
    'ltm',
    'col123',
    'Types of Long-Term Memory',
    '| Type | Description | Example |\n|---|---|---|\n| Declarative | facts | Paris |\n| Episodic | events | birthday |',
    400,
    280,
  ),
  callout(
    'warn',
    'col123',
    'Confirmation Bias',
    'The tendency to search for, interpret, favor, and recall information in a way that confirms ones preexisting beliefs or hypotheses.',
    420,
    440,
  ),
  def(
    'wm',
    'col123',
    'Working Memory Model',
    'Baddeley and Hitch multi-component model.',
    640,
    440,
    200,
    100,
  ),
  def(
    'stern',
    'col123',
    "Sternberg's Triarchic Theory",
    'Analytical, creative, practical intelligence.',
    640,
    560,
    200,
    90,
  ),
  eq('miller', 'col123', "Miller's Magic Number", '7 \\pm 2', 420, 580),
  processChart(60, 520),
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
        pairs.push(
          `${a.title?.slice(0, 20)} ∩ ${b.title?.slice(0, 20)} (${Math.round(xOl)}×${Math.round(yOl)})`,
        )
      }
    }
  }
  return { n, pairs }
}

function logPack(label: string, out: ReturnType<typeof packCheatsheetLayout>) {
  const vis = out.items.filter((i) => !i.hidden)
  const { n, pairs } = countOverlaps(vis)
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        label,
        pages: out.printPageCount,
        panels: out.layoutPanels.map((p: LayoutPanel) => ({
          t: p.title,
          x: Math.round(p.x),
          y: Math.round(p.y),
          w: Math.round(p.width),
          h: Math.round(p.height),
          lvl: p.hierarchyLevel,
          members: p.memberIds?.length,
        })),
        cards: vis.map((i) => ({
          t: i.title,
          folder: i.folderId,
          x: Math.round(i.x),
          y: Math.round(i.y),
          w: Math.round(i.width),
          h: Math.round(i.height),
          type: i.type,
        })),
        overlaps: n,
        pairs: pairs.slice(0, 15),
      },
      null,
      2,
    ),
  )
  return { vis, n, pairs }
}

describe('before→after Apply auto-layout RCA', () => {
  it('diagnoses pack of screenshot-like sheet', () => {
    const out = packCheatsheetLayout(
      beforeItems,
      { ...DEFAULT_CANVAS, printPageCount: 1, gridSpacing: 24 },
      packOpts,
    )
    const { n } = logPack('default L1+2+3 name-asc', out)
    expect(out.items.length).toBeGreaterThan(0)
    expect(n).toBe(0)

    // L1 stroked panels must not heavily paint-overlap (before fix they did)
    const l1 = out.layoutPanels.filter(
      (p) => (p.hierarchyLevel ?? 1) === 1 && p.showStroke !== false,
    )
    let panelHits = 0
    for (let i = 0; i < l1.length; i++) {
      for (let j = i + 1; j < l1.length; j++) {
        const a = l1[i]!
        const b = l1[j]!
        const xOl =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const yOl =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (xOl > 8 && yOl > 8) panelHits++
      }
    }
    expect(panelHits).toBe(0)

    const proc = out.items.find((i) => i.id === 'proc1')!
    // Mindmap must stay readable (was crushed to ~192×240)
    expect(proc.width).toBeGreaterThanOrEqual(280)
    expect(proc.height).toBeGreaterThanOrEqual(200)
  })

  it('compares flat L1-only vs nested levels', () => {
    const nested = packCheatsheetLayout(
      beforeItems,
      { ...DEFAULT_CANVAS, printPageCount: 1 },
      packOpts,
    )
    const flat = packCheatsheetLayout(
      beforeItems,
      { ...DEFAULT_CANVAS, printPageCount: 1 },
      {
        ...packOpts,
        panelGroupLevels: [1],
        panelBorderLevels: [1],
      },
    )
    const n1 = countOverlaps(nested.items.filter((i) => !i.hidden))
    const n2 = countOverlaps(flat.items.filter((i) => !i.hidden))
    logPack('nested L1+2+3', nested)
    logPack('flat L1 only', flat)
    // eslint-disable-next-line no-console
    console.log({ nestedOverlaps: n1.n, flatOverlaps: n2.n })
    expect(nested.items.length).toBe(flat.items.length)
  })

  it('process chart size after pack vs before', () => {
    const out = packCheatsheetLayout(
      beforeItems,
      { ...DEFAULT_CANVAS, printPageCount: 1 },
      packOpts,
    )
    const proc = out.items.find((i) => i.id === 'proc1')!
    const before = beforeItems.find((i) => i.id === 'proc1')!
    // eslint-disable-next-line no-console
    console.log({
      before: { w: before.width, h: before.height },
      after: { w: proc.width, h: proc.height, x: proc.x, y: proc.y },
      processFlowKept: Boolean(proc.processFlow),
      flowNodes: proc.processFlow?.nodes?.length,
    })
    expect(proc.processFlow).toBeTruthy()
  })
})
