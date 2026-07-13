import { printableContentBox } from './defaults'
import type { CanvasItem, SheetCanvas } from './types'

export type LayoutOptions = {
  /** Gap between cards (px). Default 16. */
  gap?: number
  /** Column gap when flowing to a second column. Default 20. */
  columnGap?: number
  /** Preferred max card width inside a column. Default 360. */
  columnWidth?: number
  /** Start packing from this index. Default 0. */
  fromIndex?: number
  /**
   * columns: pack into N columns (default 1, max 3)
   * single: force one column (legacy)
   */
  mode?: 'columns' | 'single'
  columns?: number
}

/**
 * Pack items into the first page printable area.
 * Default: up to 2 columns when content is tall.
 */
export function autoLayoutItems(
  items: CanvasItem[],
  canvas: SheetCanvas,
  opts: LayoutOptions = {},
): CanvasItem[] {
  const gap = opts.gap ?? 16
  const columnGap = opts.columnGap ?? 20
  const from = Math.max(0, opts.fromIndex ?? 0)
  const box = printableContentBox(canvas)
  const mode = opts.mode ?? 'columns'
  const colCount =
    mode === 'single'
      ? 1
      : Math.min(3, Math.max(1, opts.columns ?? guessColumns(items, box)))

  const colW = Math.floor(
    (box.width - columnGap * (colCount - 1)) / colCount,
  )
  const maxCardW = Math.min(opts.columnWidth ?? 400, colW)

  const colHeights = Array.from({ length: colCount }, () => box.y)

  return items.map((item, i) => {
    if (i < from) return item

    const w = Math.min(item.width, maxCardW, colW)
    const h = item.height

    // Shortest-column placement
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
      zIndex: i + 1,
    }
  })
}

function guessColumns(
  items: CanvasItem[],
  box: { width: number; height: number },
): number {
  if (items.length <= 2) return 1
  const totalH = items.reduce((s, it) => s + it.height + 16, 0)
  if (totalH > box.height * 1.15 && box.width >= 520) return 2
  if (totalH > box.height * 2.2 && box.width >= 700) return 3
  return 1
}
