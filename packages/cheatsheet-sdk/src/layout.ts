import { printableContentBox } from './defaults'
import type { CanvasItem, SheetCanvas } from './types'

export type LayoutOptions = {
  /** Gap between cards (px). Default 14 (dense) / 16 (legacy single). */
  gap?: number
  /** Column gap when flowing to a second column. Default 16. */
  columnGap?: number
  /** Preferred max card width inside a column. Default 400. */
  columnWidth?: number
  /** Start packing from this index. Default 0. */
  fromIndex?: number
  /**
   * columns: pack into N columns (default auto, max 3)
   * single: force one column (legacy)
   * sections: headings start a full-width band; cards pack in columns under each section
   */
  mode?: 'columns' | 'single' | 'sections'
  columns?: number
  /**
   * denser packing for midterm-sized sheets (smaller gaps, prefer 2–3 cols).
   * Default true when item count ≥ 8.
   */
  dense?: boolean
  /**
   * When true (default), bump canvas.printPageCount if packed height exceeds one page.
   * Mutates a copy of canvas via return metadata — caller should use layoutSheet().
   */
  multiPage?: boolean
}

export type LayoutResult = {
  items: CanvasItem[]
  /** Suggested page count so packed content fits printable height. */
  printPageCount: number
}

/**
 * Pack items into the printable area.
 * v2: denser multi-column + optional section bands (heading cards).
 */
export function autoLayoutItems(
  items: CanvasItem[],
  canvas: SheetCanvas,
  opts: LayoutOptions = {},
): CanvasItem[] {
  return layoutSheet(items, canvas, opts).items
}

/**
 * Full layout pass with multi-page page-count suggestion.
 */
export function layoutSheet(
  items: CanvasItem[],
  canvas: SheetCanvas,
  opts: LayoutOptions = {},
): LayoutResult {
  const dense =
    opts.dense ?? (items.filter((i) => !isHeadingLike(i)).length >= 8)
  const gap = opts.gap ?? (dense ? 12 : 16)
  const columnGap = opts.columnGap ?? (dense ? 14 : 20)
  const from = Math.max(0, opts.fromIndex ?? 0)
  const box = printableContentBox(canvas)
  const mode = opts.mode ?? (dense ? 'sections' : 'columns')
  const multiPage = opts.multiPage !== false

  const head = items.slice(0, from)
  const tail = items.slice(from)

  let laid: CanvasItem[]
  if (mode === 'single') {
    laid = packColumns(tail, box, {
      colCount: 1,
      gap,
      columnGap,
      maxCardW: opts.columnWidth ?? 400,
      zBase: from,
    })
  } else if (mode === 'sections') {
    laid = packBySections(tail, box, {
      gap,
      columnGap,
      maxCardW: opts.columnWidth ?? 400,
      dense,
      zBase: from,
      preferredCols: opts.columns,
    })
  } else {
    const colCount = Math.min(
      3,
      Math.max(1, opts.columns ?? guessColumns(tail, box, dense)),
    )
    laid = packColumns(tail, box, {
      colCount,
      gap,
      columnGap,
      maxCardW: Math.min(opts.columnWidth ?? 400, 9999),
      zBase: from,
    })
  }

  const all = [...head, ...laid]
  const maxBottom = all.reduce(
    (m, it) => Math.max(m, (it.y ?? 0) + (it.height ?? 0)),
    box.y,
  )
  const contentH = Math.max(1, box.height)
  const pagesNeeded = multiPage
    ? Math.min(20, Math.max(1, Math.ceil((maxBottom - box.y) / contentH)))
    : Math.max(1, canvas.printPageCount ?? 1)

  // If multi-page, re-pack overflowing content into subsequent page bands
  if (multiPage && pagesNeeded > 1) {
    const reflowed = packAcrossPages(all, canvas, {
      gap,
      columnGap,
      dense,
      mode: mode === 'single' ? 'single' : mode === 'sections' ? 'sections' : 'columns',
      columns: opts.columns,
      columnWidth: opts.columnWidth,
    })
    return {
      items: reflowed,
      printPageCount: Math.max(pagesNeeded, canvas.printPageCount ?? 1),
    }
  }

  return { items: all, printPageCount: Math.max(1, canvas.printPageCount ?? 1) }
}

function isHeadingLike(it: CanvasItem): boolean {
  if (it.type === 'equation' && it.latex) {
    // SDK headings are text-only equation cards like \text{Section}
    const t = it.latex.trim()
    if (/^\\text\{/.test(t) && t.length < 80) return true
  }
  const title = (it.title ?? '').trim()
  if (/^\d+\.\s/.test(title)) return true
  if (/^(core|section|chapter|part)\b/i.test(title) && !it.tableMarkdown) {
    if (it.type === 'equation' && it.latex?.includes('\\text{')) return true
  }
  return false
}

type Box = { x: number; y: number; width: number; height: number }

function packColumns(
  items: CanvasItem[],
  box: Box,
  opts: {
    colCount: number
    gap: number
    columnGap: number
    maxCardW: number
    zBase: number
  },
): CanvasItem[] {
  const { colCount, gap, columnGap, maxCardW, zBase } = opts
  const colW = Math.floor((box.width - columnGap * (colCount - 1)) / colCount)
  const cardMax = Math.min(maxCardW, colW)
  const colHeights = Array.from({ length: colCount }, () => box.y)

  return items.map((item, i) => {
    const w = Math.min(item.width, cardMax, colW)
    const h = item.height
    let col = 0
    for (let c = 1; c < colCount; c++) {
      if (colHeights[c]! < colHeights[col]!) col = c
    }
    const x = box.x + col * (colW + columnGap)
    const y = colHeights[col]!
    colHeights[col] = y + h + gap
    return {
      ...item,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      zIndex: zBase + i + 1,
    }
  })
}

function packBySections(
  items: CanvasItem[],
  box: Box,
  opts: {
    gap: number
    columnGap: number
    maxCardW: number
    dense: boolean
    zBase: number
    preferredCols?: number
  },
): CanvasItem[] {
  const sections: CanvasItem[][] = []
  let cur: CanvasItem[] = []
  for (const it of items) {
    if (isHeadingLike(it) && cur.length > 0) {
      sections.push(cur)
      cur = [it]
    } else {
      cur.push(it)
    }
  }
  if (cur.length) sections.push(cur)
  if (sections.length === 0) return []

  const out: CanvasItem[] = []
  let cursorY = box.y
  let z = opts.zBase

  for (const section of sections) {
    const heading = section.find(isHeadingLike)
    const body = section.filter((i) => !isHeadingLike(i))

    if (heading) {
      const hw = Math.min(heading.width, box.width)
      out.push({
        ...heading,
        x: Math.round(box.x),
        y: Math.round(cursorY),
        width: Math.round(hw),
        zIndex: ++z,
      })
      cursorY += heading.height + opts.gap
    }

    if (body.length === 0) continue

    const colCount = Math.min(
      3,
      Math.max(
        1,
        opts.preferredCols ??
          guessColumns(body, { ...box, height: box.height }, opts.dense),
      ),
    )
    const packed = packColumns(body, { ...box, y: cursorY }, {
      colCount,
      gap: opts.gap,
      columnGap: opts.columnGap,
      maxCardW: opts.maxCardW,
      zBase: z,
    })
    for (const p of packed) {
      out.push(p)
      z = Math.max(z, p.zIndex)
    }
    const bottom = packed.reduce(
      (m, it) => Math.max(m, it.y + it.height),
      cursorY,
    )
    cursorY = bottom + opts.gap * 1.25
  }

  return out
}

function packAcrossPages(
  items: CanvasItem[],
  canvas: SheetCanvas,
  opts: {
    gap: number
    columnGap: number
    dense: boolean
    mode: 'columns' | 'single' | 'sections'
    columns?: number
    columnWidth?: number
  },
): CanvasItem[] {
  // Simple: keep relative packing from single-page pass; shift y into page bands
  const box = printableContentBox(canvas)
  const pageH =
    (canvas.printSizeId
      ? // approximate page content height already in box.height
        box.height
      : box.height) +
    // full page step = content + margins ≈ use print size via content height + margin padding
    0
  // Use full page height step: content box height is printable; page frame is larger.
  // For board coords, multi-page vertical layout stacks pages with origins at n * pageHeight.
  // We approximate page step as box.height + top+bottom margins from defaults (~96).
  const pageStep = box.height + 96

  // Re-run section pack on a tall virtual box, then fold into pages
  const virtualBox = {
    ...box,
    height: box.height * 20,
  }
  let flat: CanvasItem[]
  if (opts.mode === 'sections') {
    flat = packBySections(items, virtualBox, {
      gap: opts.gap,
      columnGap: opts.columnGap,
      maxCardW: opts.columnWidth ?? 400,
      dense: opts.dense,
      zBase: 0,
      preferredCols: opts.columns,
    })
  } else {
    const colCount =
      opts.mode === 'single'
        ? 1
        : Math.min(3, Math.max(1, opts.columns ?? guessColumns(items, box, opts.dense)))
    flat = packColumns(items, virtualBox, {
      colCount,
      gap: opts.gap,
      columnGap: opts.columnGap,
      maxCardW: opts.columnWidth ?? 400,
      zBase: 0,
    })
  }

  return flat.map((it) => {
    const relY = it.y - box.y
    const page = Math.floor(relY / box.height)
    const yInPage = relY - page * box.height
    return {
      ...it,
      y: Math.round(box.y + page * pageStep + yInPage),
    }
  })
}

function guessColumns(
  items: CanvasItem[],
  box: { width: number; height: number },
  dense = false,
): number {
  const n = items.length
  if (n <= 2) return 1
  const totalH = items.reduce((s, it) => s + it.height + 12, 0)
  const threshold = dense ? 0.85 : 1.15
  if (totalH > box.height * threshold && box.width >= 500) {
    if (dense && totalH > box.height * 1.8 && box.width >= 640 && n >= 10)
      return 3
    return 2
  }
  if (totalH > box.height * 2.2 && box.width >= 700) return 3
  if (dense && n >= 12 && box.width >= 560) return 2
  return 1
}
