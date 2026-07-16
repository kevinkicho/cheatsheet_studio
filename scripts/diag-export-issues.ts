/**
 * Reproduce export knobs and report: overflow, empty space, title stacking, n-gon edges.
 * Filename: auto_md_panels_ngon_L1-2-3_bL1-2-3_nL2-3_az_ga...
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import {
  packCheatsheetLayout,
  getPackContentBox,
  rectsOverlap,
} from '../src/lib/autoOrganize'
import type { CanvasItem, SheetCanvas } from '../src/types'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'examples/agent-out/export-issues')
mkdirSync(outDir, { recursive: true })

const sheet = JSON.parse(
  readFileSync(resolve(root, 'examples/agent-out/everything.sheet.json'), 'utf8'),
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

const gap = 4
const pad = 4
const packed = packCheatsheetLayout(sheet.items, {
  ...sheet.canvas,
  dissolvePrintArea: true,
  printPageCount: Math.max(8, sheet.canvas.printPageCount ?? 8),
}, {
  density: 'md',
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
  gap,
  panelPadding: pad,
})

const box = getPackContentBox(
  { ...sheet.canvas, dissolvePrintArea: true, printPageCount: packed.printPageCount },
  { dissolvePrintArea: true },
)
const contentRight = box.left + box.width
const contentLeft = box.left
const cards = packed.items.filter((i) => !i.hidden)
const panels = packed.layoutPanels ?? []
const stroked = panels.filter((p) => p.showStroke !== false)

let overflowRight = 0
let overflowLeft = 0
for (const c of cards) {
  if (c.x + c.width > contentRight + 1) overflowRight++
  if (c.x < contentLeft - 1) overflowLeft++
}
let panelOverflow = 0
for (const p of stroked) {
  if (p.x + p.width > contentRight + 1 || p.x < contentLeft - 1) panelOverflow++
}

// L1 vs L2 title band collisions (same parent)
const L1 = panels.filter((p) => (p.hierarchyLevel ?? 1) === 1)
const L2 = panels.filter((p) => (p.hierarchyLevel ?? 1) === 2)
let titleStackHits = 0
const titleHits: string[] = []
for (const outer of L1) {
  const oMembers = new Set(outer.memberIds ?? [])
  for (const inner of L2) {
    if (!inner.memberIds?.every((id) => oMembers.has(id))) continue
    // L1 chip ~ y..y+20, L2 chip ~ y..y+18
    const l1Bot = outer.y + 22
    if (inner.y < l1Bot + 2 && inner.y + 18 > outer.y) {
      titleStackHits++
      if (titleHits.length < 8) {
        titleHits.push(
          `${outer.title} y=${outer.y} vs ${inner.title} y=${inner.y}`,
        )
      }
    }
  }
}

// N-gon complexity
let outlineEdges = 0
let polyCount = 0
let rectStroked = 0
for (const p of stroked) {
  if (p.shape === 'polygon') {
    polyCount++
    outlineEdges += (p.outlinePath?.match(/M /g) ?? []).length
  } else rectStroked++
}

// Empty space: fraction of content band not covered by cards (crude sample)
const spanH =
  Math.max(...cards.map((c) => c.y + c.height)) -
  Math.min(...cards.map((c) => c.y))
const cardArea = cards.reduce((s, c) => s + c.width * c.height, 0)
const bandArea = box.width * Math.max(1, spanH)
const fill = cardArea / bandArea

// Sample L2 panels with multi-row (tetris candidate)
const multiRow: string[] = []
for (const p of L2.slice(0, 20)) {
  const mem = (p.memberIds ?? [])
    .map((id) => cards.find((c) => c.id === id))
    .filter(Boolean) as CanvasItem[]
  if (mem.length < 2) continue
  const ys = [...new Set(mem.map((m) => Math.round(m.y / 24) * 24))]
  if (ys.length >= 2) {
    multiRow.push(
      `${p.title}: members=${mem.length} rows~${ys.length} shape=${p.shape} runs=${p.runs?.length ?? 0} edges=${(p.outlinePath?.match(/M /g) ?? []).length}`,
    )
  }
}

const report = {
  gap,
  pad,
  printPageCount: packed.printPageCount,
  contentBox: {
    left: box.left,
    width: box.width,
    right: contentRight,
    height: box.height,
  },
  cards: cards.length,
  overflowRight,
  overflowLeft,
  panelOverflow,
  titleStackHits,
  titleHits,
  polyCount,
  rectStroked,
  outlineEdges,
  spanH,
  fill: Math.round(fill * 1000) / 1000,
  multiRowSample: multiRow.slice(0, 10),
  maxCardRight: Math.max(...cards.map((c) => c.x + c.width)),
  maxPanelRight: Math.max(...stroked.map((p) => p.x + p.width)),
}

console.log(JSON.stringify(report, null, 2))
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))

// Playwright: open user SVG if present
const svgPath =
  process.argv[2] ||
  resolve(
    process.env.USERPROFILE || '',
    'Downloads',
    'Studio Everything - Full Catalog__auto_md_panels_ngon_L1-2-3_bL1-2-3_nL2-3_az_ga.svg',
  )
async function shot() {
  try {
    const { readdirSync } = await import('node:fs')
    const dl = resolve(process.env.USERPROFILE || '', 'Downloads')
    const hit = readdirSync(dl).find(
      (n) => n.includes('nL2-3') && n.endsWith('.svg'),
    )
    const path = hit ? join(dl, hit) : svgPath
    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 860, height: 1056 } })
    await page.goto(pathToFileURL(path).href, { waitUntil: 'load', timeout: 120000 })
    await page.waitForTimeout(400)
    for (let i = 0; i < 3; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 1056)
      await page.waitForTimeout(100)
      await page.screenshot({
        path: join(outDir, `user-svg-page${i + 1}.png`),
        fullPage: false,
      })
      console.log('shot page', i + 1)
    }
    await browser.close()
  } catch (e) {
    console.warn('playwright skip', e)
  }
}
await shot()
