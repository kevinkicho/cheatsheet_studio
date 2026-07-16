/**
 * Compare full-sheet pack vs in-panel dense for Mathematics → 6.1 Algebra.
 */
import { readFileSync } from 'node:fs'
import {
  packCheatsheetLayout,
  relayoutPanelContents,
} from '../src/lib/autoOrganize'

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
const algebra = panels.find(
  (p) =>
    (p.hierarchyLevel ?? 1) === 2 &&
    /6\.1|Algebra/i.test(p.title || ''),
)
const math = panels.find(
  (p) => (p.hierarchyLevel ?? 1) === 1 && /Math/i.test(p.title || ''),
)

if (!algebra || !math) {
  console.log(
    'missing',
    panels
      .filter((p) => /Math|Algebra|6\./i.test(p.title || ''))
      .map((p) => ({ t: p.title, L: p.hierarchyLevel })),
  )
  process.exit(1)
}

function metrics(
  items: typeof packed.items,
  panel: NonNullable<typeof algebra>,
  label: string,
) {
  const cards = items.filter(
    (i) => panel.memberIds?.includes(i.id) && !i.hidden,
  )
  const area = cards.reduce((s, c) => s + c.width * c.height, 0)
  const minX = Math.min(...cards.map((c) => c.x))
  const maxX = Math.max(...cards.map((c) => c.x + c.width))
  const minY = Math.min(...cards.map((c) => c.y))
  const maxY = Math.max(...cards.map((c) => c.y + c.height))
  const spanW = maxX - minX
  const spanH = maxY - minY
  const cardBBox = spanW * spanH
  // empty cells in panel AABB
  const cell = 24
  let empty = 0
  let total = 0
  for (let y = panel.y + 20; y < panel.y + panel.height - 4; y += cell) {
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
  console.log(label, {
    title: panel.title,
    panel: { x: panel.x, y: panel.y, w: panel.width, h: panel.height },
    cards: cards.length,
    cardSpan: { w: spanW, h: spanH },
    fillPanel: (area / (panel.width * panel.height)).toFixed(3),
    fillCardBBox: (area / cardBBox).toFixed(3),
    emptyFrac: total ? (empty / total).toFixed(3) : 'n/a',
    rightSlack: panel.x + panel.width - maxX,
    bottomSlack: panel.y + panel.height - maxY,
    positions: cards
      .map((c) => ({
        t: (c.title || c.id).slice(0, 28),
        x: c.x - panel.x,
        y: c.y - panel.y,
        w: c.width,
        h: c.height,
      }))
      .sort((a, b) => a.y - b.y || a.x - b.x),
  })
}

console.log('=== AFTER FULL SHEET AUTO-LAYOUT ===')
metrics(packed.items, algebra, 'full-sheet 6.1')

const { items: after, panel: nextAlg, panels: nextAll } =
  relayoutPanelContents(packed.items, algebra, {
    mode: 'dense',
    gapPx: 4,
    panelPad: 4,
    grid: 24,
    allPanels: panels,
  })

console.log('\n=== AFTER IN-PANEL AUTO-LAYOUT ON 6.1 ===')
metrics(after, nextAlg, 'in-panel 6.1')

// Parent L1 size change
const mathAfter = nextAll?.find((p) => p.id === math.id)
console.log('\nL1 Math before', {
  w: math.width,
  h: math.height,
})
console.log('L1 Math after (if rebuilt)', mathAfter && {
  w: mathAfter.width,
  h: mathAfter.height,
})
