/**
 * Studio packCheatsheetLayout (n-gon) review harness.
 * Packs everything.sheet.json, emits HTML + metrics, Playwright screenshots pages.
 *
 * Usage:
 *   npx vite-node scripts/review-ngon-layout.ts
 *   npx vite-node scripts/review-ngon-layout.ts --shape rect
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import {
  packCheatsheetLayout,
  panelRunsOverlap,
  type LayoutPanel,
} from '../src/lib/autoOrganize'
import type { CanvasItem, SheetCanvas } from '../src/types'
import { DEFAULT_CANVAS } from '../src/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const outDir = resolve(root, 'examples/agent-out/ngon-review')

const shapeArg = process.argv.includes('--shape')
  ? process.argv[process.argv.indexOf('--shape') + 1]
  : 'polygon'
const shape = shapeArg === 'rect' ? 'rect' : 'polygon'

function loadSheet() {
  const p = resolve(root, 'examples/agent-out/everything.sheet.json')
  if (!existsSync(p)) {
    throw new Error(
      `Missing ${p}. Run: npm run agent:everything`,
    )
  }
  return JSON.parse(readFileSync(p, 'utf8')) as {
    title: string
    canvas: SheetCanvas
    items: CanvasItem[]
    folders: Array<{
      id: string
      name?: string
      order?: number
      parentId?: string | null
    }>
  }
}

function analyzePanels(
  panels: LayoutPanel[],
  items: CanvasItem[],
  contentRight: number,
) {
  const stroked = panels.filter((p) => p.showStroke !== false)
  const titles = panels.filter((p) => p.showTitle !== false && p.title)
  let strokePairs = 0
  let strokeOverlap = 0
  for (let i = 0; i < stroked.length; i++) {
    for (let j = i + 1; j < stroked.length; j++) {
      strokePairs++
      if (panelRunsOverlap(stroked[i]!, stroked[j]!, 1)) strokeOverlap++
    }
  }
  const cards = items.filter((i) => !i.hidden)
  let overflowRight = 0
  for (const c of cards) {
    if (c.x + c.width > contentRight + 1) overflowRight++
  }
  // Outline edge count for n-gon complexity
  let outlineEdges = 0
  let missingOutline = 0
  for (const p of stroked) {
    if (!p.outlinePath) missingOutline++
    else outlineEdges += (p.outlinePath.match(/M /g) ?? []).length
  }
  // Title chip vs card: crude AABB — title band is top ~20px of panel
  let titleCardHits = 0
  for (const p of titles) {
    if (p.showStroke === false && (p.hierarchyLevel ?? 1) > 1) {
      const chip = {
        x: p.x + 4,
        y: p.y + 2,
        width: Math.min(140, p.width - 8),
        height: 16,
      }
      for (const c of cards) {
        if (
          c.x < chip.x + chip.width &&
          c.x + c.width > chip.x &&
          c.y < chip.y + chip.height &&
          c.y + c.height > chip.y
        ) {
          titleCardHits++
          break
        }
      }
    }
  }
  return {
    panelCount: panels.length,
    stroked: stroked.length,
    strokeOverlap,
    strokePairs,
    overflowRight,
    missingOutline,
    outlineEdges,
    titleCardHits,
    cards: cards.length,
  }
}

function renderHtml(
  title: string,
  items: CanvasItem[],
  panels: LayoutPanel[],
  pageW: number,
  totalH: number,
  metrics: Record<string, number | string>,
): string {
  const cards = items
    .filter((i) => !i.hidden)
    .map(
      (i) =>
        `<div class="card" style="left:${i.x}px;top:${i.y}px;width:${i.width}px;height:${i.height}px" title="${escapeAttr(i.title ?? i.id)}"><span>${escapeHtml((i.title ?? i.id).slice(0, 40))}</span></div>`,
    )
    .join('\n')

  const panelEls = [...panels]
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
    .map((p) => {
      const stroke = p.showStroke !== false
      const accent = p.accent ?? 'rgba(99,102,241,0.7)'
      const title =
        p.showTitle !== false && p.title
          ? `<div class="ptitle" style="left:${p.x + 6}px;top:${p.y + 3}px;border-color:${accent}">${escapeHtml(p.title)}</div>`
          : ''
      if (stroke && p.outlinePath) {
        // fill=none: outline paths are open edge segments (M/L per side). A
        // non-none fill with evenodd creates bogus blobs that hide the stroke.
        return `${title}<svg class="outline" width="${pageW}" height="${totalH}" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:2"><path d="${p.outlinePath}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linejoin="miter" stroke-linecap="square"/></svg>`
      }
      if (stroke) {
        return `${title}<div class="panel-rect" style="left:${p.x}px;top:${p.y}px;width:${p.width}px;height:${p.height}px;border-color:${accent}"></div>`
      }
      return title
    })
    .join('\n')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body { margin:0; background:#0f1115; color:#e4e4e7; font:12px system-ui; }
  #board { position:relative; width:${pageW}px; height:${totalH}px; margin:0 auto; background:#0f1115; }
  .card { position:absolute; box-sizing:border-box; border:1px solid #3f3f46; border-radius:6px; background:rgba(30,32,40,0.92); overflow:hidden; z-index:5; }
  .card span { display:block; padding:4px 6px; font-size:9px; color:#a1a1aa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .panel-rect { position:absolute; box-sizing:border-box; border:2px solid; border-radius:4px; pointer-events:none; z-index:2; background:transparent; }
  .ptitle { position:absolute; z-index:20; padding:2px 6px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; background:rgba(15,17,21,0.96); border:1px solid; border-radius:3px; max-width:160px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #metrics { position:fixed; top:8px; left:8px; z-index:100; background:rgba(0,0,0,0.85); padding:8px 10px; border-radius:6px; font:11px/1.4 ui-monospace,monospace; max-width:320px; }
</style></head><body>
<div id="metrics"><pre>${escapeHtml(JSON.stringify(metrics, null, 2))}</pre></div>
<div id="board">
${panelEls}
${cards}
</div>
</body></html>`
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttr(s: string) {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const sheet = loadSheet()
  const canvas: SheetCanvas = {
    ...DEFAULT_CANVAS,
    ...sheet.canvas,
    dissolvePrintArea: true,
    printPageCount: Math.max(1, sheet.canvas.printPageCount ?? 8),
  }
  const contentW =
    (canvas.printSizeId ? 816 : canvas.width) -
    (canvas.margins?.left ?? 48) -
    (canvas.margins?.right ?? 48)

  // N-gon focused on L2 (leaf clusters); L1 outer stays rect when polygon mode
  console.log(
    `Packing ${sheet.items.length} items as ${shape} L1-2 (borders L1+L2; n-gon L2)…`,
  )
  const packed = packCheatsheetLayout(sheet.items, canvas, {
    density: 'md',
    groupChrome: 'panels',
    panelShape: shape,
    panelPadding: 8,
    gap: 8,
    panelGroupLevels: [1, 2],
    panelBorderLevels: [1, 2],
    panelNgonLevels: shape === 'polygon' ? [2] : undefined,
    groupSort: 'name-asc',
    multiPage: true,
    dissolvePrintArea: true,
    folders: sheet.folders,
  })

  const metrics = {
    shape,
    printPageCount: packed.printPageCount,
    ...analyzePanels(
      packed.layoutPanels,
      packed.items,
      (canvas.margins?.left ?? 48) + contentW,
    ),
  }
  console.log('Metrics:', metrics)

  const maxBottom = packed.items.reduce(
    (m, it) => (it.hidden ? m : Math.max(m, it.y + it.height)),
    0,
  )
  const pageW = 816
  const totalH = Math.max(maxBottom + 48, packed.printPageCount * 1056)

  const html = renderHtml(
    `${sheet.title} · ${shape}`,
    packed.items,
    packed.layoutPanels,
    pageW,
    totalH,
    metrics as Record<string, number | string>,
  )
  const htmlPath = join(outDir, `ngon-review-${shape}.html`)
  writeFileSync(htmlPath, html, 'utf8')
  writeFileSync(
    join(outDir, `ngon-review-${shape}.metrics.json`),
    JSON.stringify(metrics, null, 2),
    'utf8',
  )
  // Write packed sheet for CLI export-svg if needed
  writeFileSync(
    join(outDir, `everything-${shape}.sheet.json`),
    JSON.stringify(
      {
        ...sheet,
        canvas: {
          ...canvas,
          printPageCount: packed.printPageCount,
          layoutPanels: packed.layoutPanels,
          height: Math.max(canvas.height, totalH + 96),
        },
        items: packed.items,
      },
      null,
      2,
    ),
    'utf8',
  )
  console.log('Wrote', htmlPath)

  // Playwright: screenshot first 3 page slices
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: pageW + 40, height: 1056 },
  })
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`)
  await page.waitForTimeout(300)
  for (let i = 0; i < Math.min(3, packed.printPageCount); i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * 1056)
    await page.waitForTimeout(100)
    const shot = join(outDir, `ngon-${shape}-page${i + 1}.png`)
    await page.screenshot({ path: shot, fullPage: false })
    console.log('Screenshot', shot)
  }
  await browser.close()
  console.log('Done. Review', outDir)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
