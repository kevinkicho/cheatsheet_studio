/**
 * Playwright: open a local multi-page SVG export, screenshot page slices,
 * and optionally re-pack with the same knobs for overlap metrics.
 *
 * Usage:
 *   npx vite-node scripts/review-export-svg.ts "C:/Users/kevin/Downloads/....svg"
 */
import { mkdirSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import {
  packCheatsheetLayout,
  panelRunsOverlap,
  rectsOverlap,
} from '../src/lib/autoOrganize'
import type { CanvasItem, SheetCanvas } from '../src/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const outDir = resolve(root, 'examples/agent-out/svg-overlap-review')
mkdirSync(outDir, { recursive: true })

function resolveSvgArg(): string {
  if (process.argv[2] && existsSync(process.argv[2])) return process.argv[2]
  const downloads = resolve(
    process.env.USERPROFILE || process.env.HOME || '',
    'Downloads',
  )
  if (!existsSync(downloads)) return process.argv[2] || ''
  const hit = readdirSync(downloads)
    .filter((n) => n.includes('ngon_L1-2-3') && n.endsWith('.svg'))
    .sort()
    .pop()
  return hit ? join(downloads, hit) : process.argv[2] || ''
}
const svgArg = resolveSvgArg()

function parseTag(name: string) {
  // auto_sm_panels_ngon_L1-2-3_bL1-2-3_nL1-2-3_az_gap8_pgap8_dissolve
  const m = name.match(/__auto_([^./]+)/)
  const tag = m?.[1] ?? ''
  const levels =
    tag.match(/_L([\d-]+)/)?.[1]?.split('-').map(Number).filter(Boolean) ?? [
      1, 2,
    ]
  const borders =
    tag.match(/_bL([\d-]+)/)?.[1]?.split('-').map(Number).filter(Boolean) ??
    levels
  const ngon =
    tag.match(/_nL([\d-]+)/)?.[1]?.split('-').map(Number).filter(Boolean) ?? []
  const gap = Number(tag.match(/_gap(\d+)/)?.[1] ?? 8)
  const pgap = Number(tag.match(/_pgap(\d+)/)?.[1] ?? 8)
  const polygon = tag.includes('_ngon_')
  const dissolve = tag.includes('dissolve')
  return {
    density: 'sm' as const,
    panelGroupLevels: levels as (1 | 2 | 3)[],
    panelBorderLevels: borders as (1 | 2 | 3)[],
    panelNgonLevels: ngon as (1 | 2 | 3)[],
    gap,
    panelPadding: pgap,
    panelShape: polygon ? ('polygon' as const) : ('rect' as const),
    dissolvePrintArea: dissolve,
    groupSort: tag.includes('_za_')
      ? ('name-desc' as const)
      : tag.includes('_az_')
        ? ('name-asc' as const)
        : ('none' as const),
  }
}

async function screenshotSvg(svgPath: string) {
  if (!existsSync(svgPath)) {
    console.error('Missing SVG:', svgPath)
    return
  }
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 860, height: 1056 },
  })
  const url = pathToFileURL(svgPath).href
  console.log('Open', url)
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForTimeout(500)
  // SVG may be tall; screenshot first 3 page-height slices
  for (let i = 0; i < 3; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * 1056)
    await page.waitForTimeout(150)
    const shot = join(outDir, `export-page${i + 1}.png`)
    await page.screenshot({ path: shot, fullPage: false })
    console.log('Screenshot', shot)
  }
  // Full page thumbnail (scaled)
  const full = join(outDir, 'export-full.png')
  await page.screenshot({ path: full, fullPage: true })
  console.log('Full page', full)
  await browser.close()
}

function analyzePack(tag: ReturnType<typeof parseTag>) {
  const sheetPath = resolve(root, 'examples/agent-out/everything.sheet.json')
  if (!existsSync(sheetPath)) {
    console.warn('No everything.sheet.json — skip pack metrics')
    return null
  }
  const sheet = JSON.parse(readFileSync(sheetPath, 'utf8')) as {
    canvas: SheetCanvas
    items: CanvasItem[]
    folders: Array<{
      id: string
      name?: string
      order?: number
      parentId?: string | null
    }>
  }
  const packed = packCheatsheetLayout(sheet.items, sheet.canvas, {
    density: tag.density,
    multiPage: true,
    groupByFolder: true,
    folders: sheet.folders,
    fitPrint: true,
    dissolvePrintArea: tag.dissolvePrintArea,
    groupChrome: 'panels',
    panelShape: tag.panelShape,
    panelGroupLevels: tag.panelGroupLevels,
    panelBorderLevels: tag.panelBorderLevels,
    panelNgonLevels:
      tag.panelShape === 'polygon' ? tag.panelNgonLevels : undefined,
    groupSort: tag.groupSort,
    gap: tag.gap,
    panelPadding: tag.panelPadding,
  })
  const stroked = (packed.layoutPanels ?? []).filter(
    (p) => p.showStroke !== false,
  )
  const cards = packed.items.filter((i) => !i.hidden)
  let sameLevel = 0
  let nested = 0
  for (let i = 0; i < stroked.length; i++) {
    for (let j = i + 1; j < stroked.length; j++) {
      const a = stroked[i]!
      const b = stroked[j]!
      if (!(panelRunsOverlap(a, b, 0) || rectsOverlap(a, b, 0))) continue
      const aSet = new Set(a.memberIds ?? [])
      const nest =
        (b.memberIds?.length && b.memberIds.every((id) => aSet.has(id))) ||
        (a.memberIds?.length &&
          a.memberIds.every((id) => (b.memberIds ?? []).includes(id)))
      if (nest) nested++
      else if ((a.hierarchyLevel ?? 1) === (b.hierarchyLevel ?? 1)) sameLevel++
    }
  }
  let cardOl = 0
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (rectsOverlap(cards[i]!, cards[j]!, 0)) cardOl++
    }
  }
  return {
    tag,
    pages: packed.printPageCount,
    stroked: stroked.length,
    sameLevelStrokeOverlaps: sameLevel,
    nestedStrokePairs: nested,
    cardOverlaps: cardOl,
    cards: cards.length,
  }
}

async function main() {
  console.log('SVG:', svgArg)
  const tag = parseTag(basename(svgArg))
  console.log('Parsed knobs:', tag)
  const metrics = analyzePack(tag)
  if (metrics) {
    console.log('Pack metrics:', metrics)
    writeFileSync(
      join(outDir, 'metrics.json'),
      JSON.stringify(metrics, null, 2),
    )
  }
  await screenshotSvg(svgArg)
  console.log('Done →', outDir)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
