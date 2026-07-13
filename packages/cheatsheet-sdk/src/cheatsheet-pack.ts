/**
 * Dense cheatsheet packer — variable-size blocks into a tight multi-column mosaic.
 *
 * Real exam sheets (unlike a vertical document) place small formulas next to
 * larger diagrams with minimal gaps, filling a target width (letter) or the
 * smallest bounding box that still fits the content.
 */
import type { CanvasItem, SheetCanvas, SheetDocument } from './types'
import { LETTER_PX, DEFAULT_MARGINS } from './defaults'

export type PackDensity = 'xs' | 'sm' | 'md' | 'lg'

export type CheatsheetPackOptions = {
  density?: PackDensity
  /** Gap between blocks (px). Default from density. */
  gap?: number
  /**
   * Target outer width for packing.
   * - number: fixed max width (content area)
   * - 'letter': letter page minus margins
   * - 'minimal': start from letter width then shrink width if sparse
   */
  target?: number | 'letter' | 'minimal'
  /**
   * If true, scale the whole pack to fit one letter page height.
   * Default true when target is letter.
   */
  fitOnePage?: boolean
  /** Outer page size for fit (default letter). */
  pageWidth?: number
  pageHeight?: number
  margins?: { top: number; right: number; bottom: number; left: number }
}

const DENSITY: Record<
  PackDensity,
  { font: number; title: number; gap: number; pad: number; scale: number }
> = {
  xs: { font: 10, title: 7, gap: 4, pad: 3, scale: 0.85 },
  sm: { font: 11, title: 8, gap: 5, pad: 4, scale: 0.92 },
  md: { font: 12, title: 9, gap: 6, pad: 5, scale: 1 },
  lg: { font: 14, title: 10, gap: 8, pad: 6, scale: 1.08 },
}

function isHeading(it: CanvasItem): boolean {
  const t = it.latex?.trim() ?? ''
  return t.startsWith('\\text{') && t.length < 120
}

function isProcess(it: CanvasItem): boolean {
  return it.type === 'process-chart' || Boolean(it.mermaidSource)
}

function isTable(it: CanvasItem): boolean {
  return it.type === 'table' || Boolean(it.tableMarkdown)
}

function isFigure(it: CanvasItem): boolean {
  return Boolean(it.imageUrl) && !it.latex && !it.tableMarkdown
}

/**
 * Estimate intrinsic size from content (not the huge builder defaults).
 * Real cheatsheets size each block to its formula/diagram, not a fixed card.
 */
export function estimateBlockSize(
  it: CanvasItem,
  density: PackDensity,
  maxW: number,
): { w: number; h: number } {
  const d = DENSITY[density]
  const s = d.scale

  if (isHeading(it)) {
    return {
      w: Math.min(maxW, Math.max(120, Math.round(maxW * 0.98))),
      h: Math.round(18 * s + d.pad * 2),
    }
  }

  if (isProcess(it)) {
    const mind = it.mermaidKind === 'mindmap' || it.mermaidSource?.includes('mindmap')
    // Compact flowcharts — not full-page diagrams
    const w = Math.min(maxW, Math.round((mind ? 200 : 168) * s))
    const lines = (it.mermaidSource ?? '').split('\n').length
    const h = Math.min(
      220,
      Math.max(mind ? 120 : 90, Math.round((70 + lines * 10) * s)),
    )
    return { w, h }
  }

  if (isTable(it)) {
    const rows = (it.tableMarkdown ?? '').split('\n').filter(Boolean).length
    const cols = ((it.tableMarkdown ?? '').split('\n')[0] ?? '').split('|')
      .length
    const w = Math.min(maxW, Math.round(Math.min(280, 70 + cols * 36) * s))
    const h = Math.round(Math.min(160, 28 + rows * 16) * s + d.pad * 2)
    return { w, h }
  }

  if (isFigure(it)) {
    return {
      w: Math.min(maxW, Math.round(140 * s)),
      h: Math.round(100 * s),
    }
  }

  // Equation / latex — size from formula length
  const latex = it.latex ?? ''
  const len = latex.replace(/\\[a-zA-Z]+/g, 'X').replace(/[{}^_]/g, '').length
  const display = latex.includes('\\frac') || latex.includes('\\sum') || latex.includes('\\int')
  const w = Math.min(
    maxW,
    Math.round(Math.min(260, Math.max(90, 40 + len * (display ? 5.5 : 4.2))) * s),
  )
  const h = Math.round((display ? 36 : 26) * s + d.title + d.pad * 2 + 4)
  return { w, h }
}

type Rect = { id: string; w: number; h: number }

/**
 * Shelf / level packer with best-fit: variable widths on each row,
 * new row when full. Headings force a full-width band.
 */
export function packRectsShelf(
  rects: Rect[],
  containerW: number,
  gap: number,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  let y = 0
  let x = 0
  let rowH = 0

  for (const r of rects) {
    const w = Math.min(r.w, containerW)
    if (x > 0 && x + w > containerW) {
      y += rowH + gap
      x = 0
      rowH = 0
    }
    pos.set(r.id, { x, y })
    x += w + gap
    rowH = Math.max(rowH, r.h)
    if (x >= containerW) {
      y += rowH + gap
      x = 0
      rowH = 0
    }
  }
  return pos
}

/**
 * Maxrects-ish free-list packer: place each rect in the free rectangle
 * that leaves the least leftover width (then height). Better for mixed sizes.
 */
export function packRectsMaxRects(
  rects: Rect[],
  containerW: number,
  gap: number,
): Map<string, { x: number; y: number }> {
  // Sort: tallest first, then widest — classic for dense packing
  const order = [...rects].sort((a, b) => b.h - a.h || b.w - a.w)
  type Free = { x: number; y: number; w: number; h: number }
  // Unlimited height free space
  const free: Free[] = [{ x: 0, y: 0, w: containerW, h: 1e7 }]
  const pos = new Map<string, { x: number; y: number }>()

  const split = (f: Free, rw: number, rh: number) => {
    const placedW = rw + gap
    const placedH = rh + gap
    const next: Free[] = []
    // Right remainder
    if (f.w > placedW) {
      next.push({ x: f.x + placedW, y: f.y, w: f.w - placedW, h: placedH })
    }
    // Below remainder
    if (f.h > placedH) {
      next.push({ x: f.x, y: f.y + placedH, w: f.w, h: f.h - placedH })
    }
    return next
  }

  for (const r of order) {
    const needW = Math.min(r.w, containerW)
    const needH = r.h
    let bestI = -1
    let bestScore = Infinity
    for (let i = 0; i < free.length; i++) {
      const f = free[i]!
      if (f.w + 0.5 < needW || f.h + 0.5 < needH) continue
      // Prefer tight leftover width, then low y (top-fill)
      const score = (f.w - needW) * 1000 + f.y
      if (score < bestScore) {
        bestScore = score
        bestI = i
      }
    }
    if (bestI < 0) {
      // Fallback: place below everything
      let maxY = 0
      for (const p of pos.values()) {
        const rect = order.find((o) => o.id === [...pos.entries()].find((e) => e[1] === p)?.[0])
        void rect
      }
      for (const [id, p] of pos) {
        const rr = rects.find((x) => x.id === id)
        if (rr) maxY = Math.max(maxY, p.y + rr.h + gap)
      }
      pos.set(r.id, { x: 0, y: maxY })
      free.push({
        x: needW + gap,
        y: maxY,
        w: Math.max(0, containerW - needW - gap),
        h: 1e7,
      })
      continue
    }
    const f = free[bestI]!
    free.splice(bestI, 1)
    pos.set(r.id, { x: f.x, y: f.y })
    free.push(...split(f, needW, needH))
    // Prune free rects fully inside others (simple)
    free.sort((a, b) => a.y - b.y || a.x - b.x)
  }
  return pos
}

export type PackResult = {
  items: CanvasItem[]
  contentWidth: number
  contentHeight: number
  pageWidth: number
  pageHeight: number
  printPageCount: number
  scaleApplied: number
}

/**
 * Pack a sheet into a dense cheatsheet mosaic.
 */
export function packCheatsheetDocument(
  sheet: SheetDocument,
  opts: CheatsheetPackOptions = {},
): PackResult {
  const density = opts.density ?? 'sm'
  const d = DENSITY[density]
  const gap = opts.gap ?? d.gap
  const margins = opts.margins ?? { ...DEFAULT_MARGINS }
  const pageW = opts.pageWidth ?? LETTER_PX.width
  const pageH = opts.pageHeight ?? LETTER_PX.height
  const contentMaxW = pageW - margins.left - margins.right
  const contentMaxH = pageH - margins.top - margins.bottom

  const targetMode = opts.target ?? 'letter'
  let packW =
    typeof targetMode === 'number'
      ? targetMode
      : contentMaxW

  const visible = sheet.items.filter((i) => !i.hidden)
  const hidden = sheet.items.filter((i) => i.hidden)

  /**
   * Section-aware pack in **document order** (like a real sheet):
   * full-width heading band → shelf-pack body blocks → next section.
   * Never reorders by height (that put headings at the bottom).
   */
  function packSections(
    width: number,
  ): {
    positions: Map<string, { x: number; y: number }>
    sized: Map<string, { w: number; h: number }>
  } {
    const sized = new Map<string, { w: number; h: number }>()
    const positions = new Map<string, { x: number; y: number }>()
    let y = 0

    // Split into sections by heading cards (preserve order)
    type Sec = { heading?: CanvasItem; body: CanvasItem[] }
    const sections: Sec[] = []
    let cur: Sec = { body: [] }
    for (const it of visible) {
      if (isHeading(it)) {
        if (cur.heading || cur.body.length) sections.push(cur)
        cur = { heading: it, body: [] }
      } else {
        cur.body.push(it)
      }
    }
    if (cur.heading || cur.body.length) sections.push(cur)
    if (sections.length === 0) {
      sections.push({ body: visible })
    }

    for (const sec of sections) {
      if (sec.heading) {
        const h = Math.round(15 + d.pad * 2)
        sized.set(sec.heading.id, { w: width, h })
        positions.set(sec.heading.id, { x: 0, y })
        y += h + gap
      }
      const bodyRects: Rect[] = []
      for (const it of sec.body) {
        let { w, h } = estimateBlockSize(it, density, width)
        w = Math.min(width, Math.max(48, w))
        h = Math.max(18, h)
        sized.set(it.id, { w, h })
        bodyRects.push({ id: it.id, w, h })
      }
      if (bodyRects.length === 0) continue
      // Shelf pack body in reading order (side-by-side when they fit)
      const local = packRectsShelf(bodyRects, width, gap)
      let localMax = 0
      for (const r of bodyRects) {
        const p = local.get(r.id)!
        positions.set(r.id, { x: p.x, y: y + p.y })
        localMax = Math.max(localMax, p.y + r.h)
      }
      y += localMax + gap
    }
    return { positions, sized }
  }

  let { positions, sized } = packSections(packW)

  // Minimal: try narrower widths while height stays ≤ ~1.2× letter content
  if (targetMode === 'minimal') {
    let lo = Math.min(360, packW)
    let hi = packW
    let bestW = packW
    let best = { positions, sized }
    for (let iter = 0; iter < 10; iter++) {
      const mid = Math.round((lo + hi) / 2)
      const trial = packSections(mid)
      let maxY = 0
      for (const [id, p] of trial.positions) {
        const sz = trial.sized.get(id)!
        maxY = Math.max(maxY, p.y + sz.h)
      }
      if (maxY <= contentMaxH * 1.25) {
        bestW = mid
        best = trial
        hi = mid - 6
      } else {
        lo = mid + 6
      }
    }
    packW = bestW
    positions = best.positions
    sized = best.sized
  }

  let maxY = 0
  let maxX = 0
  for (const [id, p] of positions) {
    const sz = sized.get(id)!
    maxY = Math.max(maxY, p.y + sz.h)
    maxX = Math.max(maxX, p.x + sz.w)
  }
  let contentH = Math.max(1, maxY)
  let contentW = Math.max(1, Math.min(packW, maxX))

  // Fit one letter page: uniform scale if overflowing height
  const fitOne =
    opts.fitOnePage !== undefined
      ? opts.fitOnePage
      : targetMode === 'letter' || targetMode === 'minimal'
  let scaleApplied = 1
  if (fitOne && contentH > contentMaxH) {
    scaleApplied = Math.max(0.42, contentMaxH / contentH)
    contentH = Math.round(contentH * scaleApplied)
    contentW = Math.round(contentW * scaleApplied)
  }

  const originX = margins.left
  const originY = margins.top

  const placed = visible.map((it, i) => {
    const sz = sized.get(it.id) ?? { w: it.width, h: it.height }
    const xy = positions.get(it.id) ?? { x: 0, y: i * 40 }
    const w = Math.max(32, Math.round(sz.w * scaleApplied))
    const h = Math.max(14, Math.round(sz.h * scaleApplied))
    return {
      ...it,
      x: Math.round(originX + xy.x * scaleApplied),
      y: Math.round(originY + xy.y * scaleApplied),
      width: w,
      height: h,
      zIndex: i + 1,
      autoFit: false,
      contentFill: true,
      style: {
        ...it.style,
        fontSize: Math.max(8, Math.round(d.font * Math.sqrt(scaleApplied))),
        titleFontSize: Math.max(6, Math.round(d.title * Math.sqrt(scaleApplied))),
        padding: d.pad,
      },
    }
  })

  const printPageCount = fitOne
    ? 1
    : Math.min(20, Math.max(1, Math.ceil(contentH / contentMaxH)))

  return {
    items: [...placed, ...hidden],
    contentWidth: contentW,
    contentHeight: contentH,
    pageWidth: pageW,
    pageHeight: fitOne
      ? pageH
      : Math.max(pageH, contentH + margins.top + margins.bottom),
    printPageCount,
    scaleApplied,
  }
}

export function packSheetDocument(
  sheet: SheetDocument,
  opts?: CheatsheetPackOptions,
): SheetDocument {
  const packed = packCheatsheetDocument(sheet, opts)
  return {
    ...sheet,
    items: packed.items,
    canvas: {
      ...sheet.canvas,
      printPageCount: packed.printPageCount,
      width: packed.pageWidth + 96,
      height: packed.pageHeight + 96,
    },
  }
}
