import type { CanvasItem } from '@/types'
import { titleBandPx } from '@/types'
import {
  MIN_READABLE_TITLE_FONT,
  GRID_PACK_FILL_TARGET,
} from './constants'
import { isProcessItem, isHeadingCard } from './folders'
import { placeTopicRegionsDense } from './shelf'

export function minCardForFonts(
  bodyFont: number,
  titleFont: number = bodyFont,
): { w: number; h: number } {
  const band = titleBandPx(titleFont)
  return {
    w: Math.max(104, Math.round(bodyFont * 7)),
    h: Math.max(56, band + Math.round(bodyFont * 2.6) + 12),
  }
}

export function minReadableCardSize(
  titleFont: number = MIN_READABLE_TITLE_FONT,
): { w: number; h: number } {
  const band = titleBandPx(titleFont)
  return {
    w: 72,
    h: Math.max(40, band + 22),
  }
}

function isLrProcess(it: CanvasItem): boolean {
  return (
    isProcessItem(it) &&
    (it.mermaidDirection === 'LR' ||
      it.mermaidDirection === 'RL' ||
      /flowchart\s+LR/i.test(it.mermaidSource ?? '') ||
      /flowchart\s+RL/i.test(it.mermaidSource ?? ''))
  )
}

function isMindProcess(it: CanvasItem): boolean {
  return (
    isProcessItem(it) &&
    (it.mermaidKind === 'mindmap' ||
      /\bmindmap\b/i.test(it.mermaidSource ?? ''))
  )
}

/**
 * Ideal content-native size (export 19 baseline).
 * Formula / diagram drives size — not title string length (that re-inflated
 * empty shells).
 */
export function estimateIdealBlockSize(
  it: CanvasItem,
  maxW: number,
  titleFont: number = MIN_READABLE_TITLE_FONT,
): { w: number; h: number } {
  const min = minReadableCardSize(titleFont)
  const band = titleBandPx(titleFont)
  const showTitle = it.showTitle !== false && Boolean((it.title ?? '').trim())
  const titleH = showTitle ? band : 0

  if (isHeadingCard(it)) {
    return {
      w: Math.min(maxW, Math.max(160, Math.round(maxW * 0.98))),
      h: Math.max(22, band + 2),
    }
  }

  if (isProcessItem(it)) {
    const src = it.mermaidSource ?? ''
    const lines = Math.max(3, src.split('\n').filter(Boolean).length)
    if (isMindProcess(it)) {
      return {
        w: Math.min(maxW, 200),
        h: Math.min(220, Math.max(160, 120 + lines * 8)) + titleH,
      }
    }
    if (isLrProcess(it)) {
      return {
        w: Math.min(maxW, Math.max(280, Math.round(maxW * 0.42))),
        h: Math.max(min.h, 56 + titleH),
      }
    }
    return {
      w: Math.min(maxW, 160),
      h: Math.min(260, Math.max(140, 100 + lines * 12)) + titleH,
    }
  }

  if (it.type === 'table' || it.tableMarkdown) {
    const rows = (it.tableMarkdown ?? '').split('\n').filter(Boolean).length
    const cols = ((it.tableMarkdown ?? '').split('\n')[0] ?? '').split('|')
      .length
    return {
      w: Math.min(maxW, Math.max(min.w, 72 + cols * 32)),
      h: Math.max(min.h, 28 + rows * 14 + titleH),
    }
  }

  if (it.imageUrl || it.type === 'figure') {
    return { w: Math.min(maxW, 140), h: Math.max(min.h, 100 + titleH) }
  }

  // Equation — snug to latex (short FV / Continuous stay compact like export 19)
  const latex = it.latex ?? ''
  const len = latex.replace(/\\[a-zA-Z]+/g, 'X').replace(/[{}^_]/g, '').length
  const display =
    latex.includes('\\frac') ||
    latex.includes('\\sum') ||
    latex.includes('\\int') ||
    latex.includes('\\prod') ||
    latex.includes('\\\\')
  const stacked = (latex.match(/\\frac/g) || []).length
  const w = Math.min(
    maxW,
    Math.max(min.w, Math.min(200, 44 + len * (display ? 4.5 : 3.6))),
  )
  const bodyH = display ? 36 + stacked * 8 : 22
  const h = Math.max(min.h, bodyH + titleH + 4)
  return { w: Math.round(w), h: Math.round(h) }
}

/**
 * Snap width/height to whole grid cells.
 * Rounds to nearest cell (not always ceil) so we don’t inflate aspect by a full cell.
 */
export function snapSizeToGrid(
  w: number,
  h: number,
  grid: number,
  maxW: number,
  maxH: number,
): { w: number; h: number; cw: number; ch: number } {
  const g = Math.max(4, grid)
  const maxCw = Math.max(1, Math.floor(maxW / g))
  const maxCh = Math.max(1, Math.floor(maxH / g))
  let cw = Math.max(1, Math.round(w / g))
  let ch = Math.max(1, Math.round(h / g))
  // Never round down to 0; if very small, at least 1 cell
  if (w > g * 0.4 && cw < 1) cw = 1
  if (h > g * 0.4 && ch < 1) ch = 1
  cw = Math.min(cw, maxCw)
  ch = Math.min(ch, maxCh)
  return { w: cw * g, h: ch * g, cw, ch }
}

/**
 * Reading-order shelf pack on a grid (left→right, wrap). No reordering —
 * preferred for section body cards so formulas stay in catalog order.
 */
export function packRectsShelfOnGrid(
  rects: Array<{ id: string; cw: number; ch: number }>,
  cols: number,
): Map<string, { c: number; r: number }> {
  const pos = new Map<string, { c: number; r: number }>()
  if (cols < 1) return pos
  let c = 0
  let r = 0
  let rowH = 0
  for (const rect of rects) {
    const cw = Math.min(Math.max(1, rect.cw), cols)
    const ch = Math.max(1, rect.ch)
    if (c > 0 && c + cw > cols) {
      r += rowH
      c = 0
      rowH = 0
    }
    pos.set(rect.id, { c, r })
    c += cw
    rowH = Math.max(rowH, ch)
    if (c >= cols) {
      r += rowH
      c = 0
      rowH = 0
    }
  }
  return pos
}

// ─── Area-proportional topic pack (grid cells as unit area) ─────────────────

export type CellRect = { id: string; cw: number; ch: number }

export type TopicSectionPlan = {
  /** Index into section list (document order). */
  index: number
  heading?: CanvasItem
  body: CanvasItem[]
  /**
   * Folder that owns this panel after panelGroupLevel mapping
   * (e.g. top-level id when level=1, even if cards live in 1.1).
   */
  groupFolderId?: string | null
  /** Ideal body area in grid cells (pre-scale). */
  idealCells: number
  /** Share of total ideal body area (0–1). */
  areaShare: number
  /**
   * Outer region size in cells (includes pad + title chrome).
   * Used for non-overlapping region placement = panel size.
   */
  regionCw: number
  regionCh: number
  /** Inner content size (cards only). */
  contentCw: number
  contentCh: number
  /** Pad on each side in cells (panel chrome). */
  padCells: number
  /** Scaled body rects (cw/ch). */
  bodyRects: CellRect[]
  /** Local card positions inside content area (0,0 = after pad+title). */
  bodyPos: Map<string, { c: number; r: number }>
  /** Banner row cells when groupChrome includes labels. */
  headingCh: number
  /** In-panel title strip cells when panels-only (no banner cards). */
  panelTitleCh: number
}

/**
 * Linear size scale so total card area (in cells) fits the multipage budget.
 * Never grows past 1; floors at minScale for readability.
 */
export function computeGridAreaScale(
  totalIdealCells: number,
  pageCells: number,
  pages: number,
  fillTarget = GRID_PACK_FILL_TARGET,
  minScale = 0.55,
): number {
  if (totalIdealCells < 1 || pageCells < 1) return 1
  const budget = Math.max(1, pages * pageCells * fillTarget)
  // Area scales with s² when both dimensions scale by s
  const s = Math.sqrt(budget / totalIdealCells)
  return Math.min(1, Math.max(minScale, s))
}

/**
 * Choose how many letter pages so scale ≥ minScale for the ideal cell total.
 */
export function pagesForIdealCells(
  totalIdealCells: number,
  pageCells: number,
  fillTarget = GRID_PACK_FILL_TARGET,
  minScale = 0.55,
  maxPages = 20,
): number {
  if (totalIdealCells < 1 || pageCells < 1) return 1
  // Need pages such that budget >= totalIdeal * minScale²
  const need = Math.ceil(
    (totalIdealCells * minScale * minScale) / (pageCells * fillTarget),
  )
  return Math.min(maxPages, Math.max(1, need))
}

/**
 * Scale cell rects by linear scale s; clamp to mins and max width.
 */
export function scaleCellRects(
  rects: CellRect[],
  s: number,
  maxCw: number,
  minCw = 2,
  minCh = 1,
): CellRect[] {
  return rects.map((r) => ({
    id: r.id,
    cw: Math.max(minCw, Math.min(maxCw, Math.round(r.cw * s))),
    ch: Math.max(minCh, Math.round(r.ch * s)),
  }))
}

/** Measure shelf pack: actual bounding size (not forced full width). */
export function measureShelfPack(
  rects: CellRect[],
  maxCols: number,
): {
  pos: Map<string, { c: number; r: number }>
  usedCw: number
  usedCh: number
} {
  if (rects.length === 0 || maxCols < 1) {
    return { pos: new Map(), usedCw: 1, usedCh: 1 }
  }
  const clamped = rects.map((r) => ({
    ...r,
    cw: Math.min(Math.max(1, r.cw), maxCols),
  }))
  const pos = packRectsShelfOnGrid(clamped, maxCols)
  let usedCw = 0
  let usedCh = 0
  for (const r of clamped) {
    const p = pos.get(r.id)
    if (!p) continue
    usedCw = Math.max(usedCw, p.c + r.cw)
    usedCh = Math.max(usedCh, p.r + r.ch)
  }
  return {
    pos,
    usedCw: Math.max(1, usedCw),
    usedCh: Math.max(1, usedCh),
  }
}

/**
 * Pack a topic's cards into a **natural** tight block (not forced columns).
 * Tries several max widths with **free-flow dense** packing (maxrects-style)
 * and shelf as a fallback, picking the bounding box with least waste so
 * n-gon / rect chrome can fill right-side holes instead of stacking tall
 * full-width shelves.
 */
export function naturalTopicPack(
  bodyRects: CellRect[],
  pageCols: number,
): {
  /** Body rects (cw may be clamped to chosen width). */
  rects: CellRect[]
  /** Local positions inside the block. */
  pos: Map<string, { c: number; r: number }>
  /** Content width/height in cells (no panel pad). */
  contentCw: number
  contentCh: number
} {
  if (bodyRects.length === 0) {
    return {
      rects: [],
      pos: new Map(),
      contentCw: 1,
      contentCh: 1,
    }
  }
  const maxCardW = Math.max(1, ...bodyRects.map((r) => r.cw))
  const candidates = Array.from(
    new Set(
      [
        pageCols,
        Math.ceil((pageCols * 3) / 4),
        Math.ceil((pageCols * 2) / 3),
        Math.ceil(pageCols / 2),
        Math.ceil(pageCols / 3),
        Math.min(pageCols, Math.max(maxCardW, 6)),
        Math.min(pageCols, maxCardW),
        // Extra mid widths so residual page columns get used more often
        Math.min(pageCols, Math.max(maxCardW, Math.ceil(pageCols * 0.4))),
        Math.min(pageCols, Math.max(maxCardW, Math.ceil(pageCols * 0.55))),
      ]
        .map((w) => Math.max(maxCardW, Math.min(pageCols, w)))
        .filter((w) => w >= 1),
    ),
  ).sort((a, b) => a - b)

  let best: {
    rects: CellRect[]
    pos: Map<string, { c: number; r: number }>
    contentCw: number
    contentCh: number
    score: number
  } | null = null

  const scorePack = (
    rects: CellRect[],
    _pos: Map<string, { c: number; r: number }>,
    usedCw: number,
    usedCh: number,
  ) => {
    const contentCells = rects.reduce((s, r) => s + r.cw * r.ch, 0)
    const boxCells = usedCw * usedCh
    const waste = boxCells / Math.max(1, contentCells)
    // Primary: minimize height so neighbors can sit side-by-side and fill
    // right-side page columns. Secondary: low waste / compact area.
    return (
      usedCh * 1e6 +
      waste * 800 +
      usedCw * usedCh * 4 +
      // Mild preference for using more of the available width (fewer empty cols)
      (pageCols - usedCw) * 12
    )
  }

  for (const w of candidates) {
    const rects = bodyRects.map((r) => ({
      ...r,
      cw: Math.min(r.cw, w),
    }))
    // Multi-order free-flow tetris (same engine as in-panel auto-layout).
    // Do NOT default to shelf — shelf often wins the waste score with a
    // full-width first row + sparse second row (weird 6.1 Algebra packing)
    // while free-flow looks denser and matches “Auto-layout inside panel”.
    const densePos = placeTopicRegionsDense(
      rects.map((r, i) => ({ index: i, cw: r.cw, ch: r.ch })),
      w,
      0,
      { multiOrder: true, readingFlow: false },
    )
    let usedCw = 1
    let usedCh = 1
    const pos = new Map<string, { c: number; r: number }>()
    rects.forEach((r, i) => {
      const p = densePos.get(i) ?? { c: 0, r: 0 }
      pos.set(r.id, p)
      usedCw = Math.max(usedCw, p.c + r.cw)
      usedCh = Math.max(usedCh, p.r + r.ch)
    })
    usedCw = Math.min(w, usedCw)
    const denseScore = scorePack(rects, pos, usedCw, usedCh)
    if (!best || denseScore < best.score) {
      best = {
        rects,
        pos,
        contentCw: usedCw,
        contentCh: usedCh,
        score: denseScore,
      }
    }

    // Shelf only if *clearly* better (was stealing wins on ~equal scores and
    // leaving left-aligned sparse rows that in-panel free-flow then fixed).
    const shelf = measureShelfPack(rects, w)
    const shelfScore = scorePack(
      rects,
      shelf.pos,
      shelf.usedCw,
      shelf.usedCh,
    )
    if (shelfScore < denseScore * 0.92) {
      if (!best || shelfScore < best.score) {
        best = {
          rects,
          pos: shelf.pos,
          contentCw: shelf.usedCw,
          contentCh: shelf.usedCh,
          score: shelfScore,
        }
      }
    }
  }

  return {
    rects: best!.rects,
    pos: best!.pos,
    contentCw: best!.contentCw,
    contentCh: best!.contentCh,
  }
}
