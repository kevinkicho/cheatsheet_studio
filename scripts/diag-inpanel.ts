import { readFileSync } from 'node:fs'
import { packCheatsheetLayout, relayoutPanelContents } from '../src/lib/autoOrganize'

const sheet = JSON.parse(
  readFileSync('examples/agent-out/everything.sheet.json', 'utf8'),
)
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
    panelGroupLevels: [1, 2, 3],
    panelBorderLevels: [1, 2, 3],
    groupSort: 'name-asc',
    gap: 4,
    panelPadding: 4,
  },
)
const panels = packed.layoutPanels ?? []
const math = panels.find(
  (p) => (p.hierarchyLevel ?? 1) === 1 && /Math/i.test(p.title || ''),
)
if (!math) {
  console.log('no math L1', panels.filter((p) => (p.hierarchyLevel ?? 1) === 1).map((p) => p.title))
  process.exit(1)
}
console.log('L1 math', {
  id: math.id,
  title: math.title,
  x: math.x,
  y: math.y,
  w: math.width,
  h: math.height,
  members: math.memberIds?.length,
})
const l2s = panels.filter(
  (p) =>
    (p.hierarchyLevel ?? 1) === 2 &&
    math.memberIds?.length &&
    p.memberIds?.every((id) => math.memberIds!.includes(id)),
)
console.log(
  'L2s before',
  l2s.map((p) => ({
    title: p.title,
    x: p.x,
    y: p.y,
    w: p.width,
    h: p.height,
    n: p.memberIds?.length,
  })),
)

function fill(items: typeof packed.items, panel: typeof math) {
  const cards = items.filter((i) => panel.memberIds?.includes(i.id) && !i.hidden)
  const area = cards.reduce((s, c) => s + c.width * c.height, 0)
  return {
    cards: cards.length,
    area,
    panelArea: panel.width * panel.height,
    ratio: area / (panel.width * panel.height),
  }
}
console.log('before fill', fill(packed.items, math))

// right/bottom slack before
{
  const cards = packed.items.filter(
    (i) => math.memberIds?.includes(i.id) && !i.hidden,
  )
  const maxX = Math.max(...cards.map((c) => c.x + c.width))
  const maxY = Math.max(...cards.map((c) => c.y + c.height))
  console.log('before slack R/B', math.x + math.width - maxX, math.y + math.height - maxY)
}

const { items, panel, panels: nextAll } = relayoutPanelContents(
  packed.items,
  math,
  {
    mode: 'dense',
    gapPx: 4,
    panelPad: 4,
    grid: 24,
    allPanels: panels,
  },
)
console.log('after panel', {
  x: panel.x,
  y: panel.y,
  w: panel.width,
  h: panel.height,
})
console.log('after fill', fill(items, panel))
const l2b = (nextAll ?? []).filter(
  (p) =>
    (p.hierarchyLevel ?? 1) === 2 &&
    panel.memberIds?.length &&
    p.memberIds?.every((id) => panel.memberIds!.includes(id)),
)
console.log(
  'L2 after',
  l2b.map((p) => ({
    title: p.title,
    x: p.x,
    y: p.y,
    w: p.width,
    h: p.height,
    n: p.memberIds?.length,
  })),
)

let escapes = 0
let titleHits = 0
for (const p of l2b) {
  for (const id of p.memberIds ?? []) {
    const c = items.find((i) => i.id === id)
    if (!c) continue
    if (
      c.x < p.x - 2 ||
      c.y < p.y - 2 ||
      c.x + c.width > p.x + p.width + 2 ||
      c.y + c.height > p.y + p.height + 2
    )
      escapes++
    if (c.y < p.y + 16 - 1) titleHits++
  }
}
console.log({ escapes, titleHits })

const cards = items.filter((i) => panel.memberIds?.includes(i.id) && !i.hidden)
const minX = Math.min(...cards.map((c) => c.x))
const maxX = Math.max(...cards.map((c) => c.x + c.width))
const minY = Math.min(...cards.map((c) => c.y))
const maxY = Math.max(...cards.map((c) => c.y + c.height))
console.log('card bbox', {
  minX,
  maxX,
  minY,
  maxY,
  spanW: maxX - minX,
  spanH: maxY - minY,
  panelW: panel.width,
  panelH: panel.height,
})
console.log(
  'right slack',
  panel.x + panel.width - maxX,
  'bottom slack',
  panel.y + panel.height - maxY,
)

// measure empty holes: fraction of panel AABB not covered by any card (coarse grid)
const cell = 24
let empty = 0
let total = 0
for (let y = panel.y + 42; y < panel.y + panel.height - 4; y += cell) {
  for (let x = panel.x + 4; x < panel.x + panel.width - 4; x += cell) {
    total++
    const hit = cards.some(
      (c) =>
        x + cell > c.x &&
        x < c.x + c.width &&
        y + cell > c.y &&
        y < c.y + c.height,
    )
    if (!hit) empty++
  }
}
console.log('empty cell fraction', empty, '/', total, '=', (empty / total).toFixed(3))
