import { packCheatsheetLayout, gapPxToCells, resolveLayoutGaps } from './src/lib/autoOrganize'
import type { CanvasItem } from './src/types'

const DEFAULT_CANVAS = {
  width: 816, height: 1056, margins: { top: 48, right: 48, bottom: 48, left: 48 },
  gridSpacing: 24, printPageCount: 1, dissolvePrintArea: true,
}

function card(id: string, o: Partial<CanvasItem> = {}): CanvasItem {
  return {
    id, type: 'equation', x: 0, y: 0, width: 120, height: 72,
    latex: id, title: id, folderId: o.folderId as string, ...o,
  } as CanvasItem
}

const folders = [
  { id: 'f1', order: 0, name: '1. Alpha', parentId: null },
  { id: 'f1a', order: 0, name: '1.1 SubA', parentId: 'f1' },
  { id: 'f1b', order: 1, name: '1.2 SubB', parentId: 'f1' },
  { id: 'f2', order: 1, name: '2. Beta', parentId: null },
  { id: 'f2a', order: 0, name: '2.1 Sub', parentId: 'f2' },
]
const items: CanvasItem[] = [
  card('a1', { folderId: 'f1a', width: 100, height: 60 }),
  card('a2', { folderId: 'f1a', width: 100, height: 60 }),
  card('b1', { folderId: 'f1b', width: 100, height: 60 }),
  card('b2', { folderId: 'f1b', width: 100, height: 60 }),
  card('c1', { folderId: 'f2a', width: 100, height: 60 }),
  card('c2', { folderId: 'f2a', width: 100, height: 60 }),
]

function diag(label: string, shape: 'rect'|'polygon', gaps: {l1:number,l2:number,block:number}) {
  const out = packCheatsheetLayout(items, DEFAULT_CANVAS as any, {
    density: 'sm',
    groupChrome: 'panels',
    panelShape: shape,
    panelGroupLevels: [1, 2],
    panelBorderLevels: [1, 2],
    panelNgonLevels: [1, 2],
    panelPadding: 4,
    l1PanelGap: gaps.l1,
    l2PanelGap: gaps.l2,
    blockGap: gaps.block,
    folders,
    groupSort: 'name-asc',
    multiPage: true,
    dissolvePrintArea: true,
  })
  const panels = out.layoutPanels ?? []
  const L1 = panels.filter(p => (p.hierarchyLevel??1)===1 && p.showStroke !== false)
  const L2 = panels.filter(p => (p.hierarchyLevel??1)===2 && p.showStroke !== false)
  L1.sort((a,b)=>a.y-b.y)
  const l1Gap = L1.length >= 2 ? L1[1]!.y - (L1[0]!.y + L1[0]!.height) : null
  // L2 under first L1
  const set = new Set(L1[0]?.memberIds ?? [])
  const kids = L2.filter(p => p.memberIds?.every(id => set.has(id))).sort((a,b)=>a.y-b.y||a.x-b.x)
  let l2Gap: number | null = null
  if (kids.length >= 2) {
    // find pair that stacks vertically
    for (let i=0;i<kids.length;i++) for (let j=i+1;j<kids.length;j++) {
      const a=kids[i]!, b=kids[j]!
      const xOl = Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)
      if (xOl > 10) {
        l2Gap = Math.min(b.y - (a.y+a.height), a.y - (b.y+b.height))
        if (l2Gap < 0) l2Gap = Math.max(b.y - (a.y+a.height), a.y - (b.y+b.height))
      }
    }
  }
  // block gap within first L2
  const mem = (kids[0]?.memberIds ?? []).map(id => out.items.find(i=>i.id===id)!).filter(Boolean)
  let blockGap: number | null = null
  if (mem.length >= 2) {
    mem.sort((a,b)=>a.y-b.y||a.x-b.x)
    const a=mem[0]!, b=mem[1]!
    const xOl = Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)
    const yOl = Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)
    if (xOl > 0) blockGap = b.y - (a.y+a.height)
    else if (yOl > 0) blockGap = b.x - (a.x+a.width)
    else blockGap = Math.min(b.y-(a.y+a.height), b.x-(a.x+a.width))
  }
  console.log(label, {
    cells: { l1: gapPxToCells(gaps.l1+8,24), l2: gapPxToCells(gaps.l2+8+16,24), block: gapPxToCells(gaps.block,24) },
    resolved: resolveLayoutGaps({ l1PanelGap: gaps.l1, l2PanelGap: gaps.l2, blockGap: gaps.block }),
    L1: L1.map(p=>({t:p.title,shape:p.shape,y:p.y,h:p.height,runs:p.runs?.length})),
    L2shapes: L2.map(p=>p.shape),
    measured: { l1Gap, l2Gap, blockGap },
  })
}

console.log('gapPxToCells samples', [0,2,4,12,24,48].map(p=>({p,c:gapPxToCells(p,24)})))
diag('rect L1=0', 'rect', {l1:0,l2:0,block:0})
diag('rect L1=48', 'rect', {l1:48,l2:0,block:0})
diag('ngon L1=0', 'polygon', {l1:0,l2:0,block:0})
diag('ngon L1=48', 'polygon', {l1:48,l2:0,block:0})
diag('ngon block=48', 'polygon', {l1:2,l2:2,block:48})
