import type { CanvasItem, PrintMargins, SheetCanvas } from '@/types'
import { DEFAULT_MARGINS } from '@/types'
import { getPrintPageSize } from '@/lib/printSizes'

/**
 * Default snap / display grid (px).
 * 24px aligns with 0.5″ (48px) Letter margins: 48/24 = 2 cells.
 */
export const ORGANIZE_GRID = 24
const DEFAULT_GAP = 16

export function snapToGridValue(n: number, grid = ORGANIZE_GRID): number {
  if (!Number.isFinite(n) || grid <= 0) return n
  return Math.round(n / grid) * grid
}

/**
 * Content box for auto-organize = print page (not full workspace) − margins.
 * Falls back to workspace if print size is missing.
 */
export function getContentBox(canvas: SheetCanvas) {
  const margins: PrintMargins = {
    ...DEFAULT_MARGINS,
    ...(canvas.margins ?? {}),
  }

  const page = getPrintPageSize(
    canvas.printSizeId ?? 'letter',
    canvas.orientation ?? 'portrait',
  )
  // Organize against the print page frame at origin (0,0), not the free workspace
  const pageW = page.width
  const pageH = page.height

  const maxMarginX = Math.max(0, Math.floor((pageW - 80) / 2))
  const maxMarginY = Math.max(0, Math.floor((pageH - 80) / 2))
  const left = Math.min(Math.max(0, margins.left), maxMarginX)
  const right = Math.min(Math.max(0, margins.right), maxMarginX)
  const top = Math.min(Math.max(0, margins.top), maxMarginY)
  const bottom = Math.min(Math.max(0, margins.bottom), maxMarginY)

  const contentLeft = left
  const contentTop = top
  const contentWidth = Math.max(80, pageW - left - right)
  const contentHeight = Math.max(80, pageH - top - bottom)

  return {
    left: contentLeft,
    top: contentTop,
    width: contentWidth,
    height: contentHeight,
    right: contentLeft + contentWidth,
    bottom: contentTop + contentHeight,
    pageWidth: pageW,
    pageHeight: pageH,
    margins: { top, right, bottom, left },
  }
}

function snapUp(n: number, grid: number) {
  return Math.ceil(n / grid) * grid
}

function snapDown(n: number, grid: number) {
  return Math.floor(n / grid) * grid
}

/**
 * Grid-based auto-organize:
 *
 * 1. Take the printable content box (page − margins) at click time
 * 2. Divide it into a fine grid (default 24px — fits 0.5″ margins)
 * 3. Sort cards by current reading order (top→bottom, left→right)
 * 4. Pack left→right, wrap to next grid row when the next card won't fit
 * 5. Snap every position to the grid so columns/rows line up cleanly
 *
 * Card sizes are preserved (only snapped up to whole cells for spacing math).
 * autoFit is frozen so measure-pass doesn't undo the layout.
 */
export function layoutItemsInRows(
  items: CanvasItem[],
  canvas: SheetCanvas,
  options: { gap?: number; grid?: number } = {},
): CanvasItem[] {
  if (items.length === 0) return items

  const gap = options.gap ?? DEFAULT_GAP
  const grid = Math.max(4, options.grid ?? canvas.gridSpacing ?? ORGANIZE_GRID)
  const box = getContentBox(canvas)

  // Grid origin = content box top-left; usable columns/rows in cell units
  const originX = box.left
  const originY = box.top
  // Snap content width down so we never place past the margin edge
  const usableW = snapDown(box.width, grid)
  const usableH = snapDown(box.height, grid)
  if (usableW < grid || usableH < grid) {
    // Degenerate margins — pin everything to content origin
    return items.map((item, i) => ({
      ...item,
      x: originX,
      y: originY + i * (item.height + gap),
      autoFit: false,
    }))
  }

  // Reading order from where the user left things
  const ordered = [...items].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y
    if (a.x !== b.x) return a.x - b.x
    return a.id.localeCompare(b.id)
  })

  // Cursor in grid cells relative to origin
  let cellX = 0
  let cellY = 0
  let rowHeightCells = 0

  const gapCells = Math.max(1, Math.round(gap / grid))
  const maxCellsX = Math.floor(usableW / grid)
  const maxCellsY = Math.floor(usableH / grid)

  const placed: CanvasItem[] = []

  for (const item of ordered) {
    // How many cells this card occupies (at least 1×1)
    const wCells = Math.max(1, snapUp(item.width, grid) / grid)
    const hCells = Math.max(1, snapUp(item.height, grid) / grid)

    // Wrap if this card doesn't fit on the current row
    if (cellX > 0 && cellX + wCells > maxCellsX) {
      cellX = 0
      cellY += rowHeightCells + gapCells
      rowHeightCells = 0
    }

    // If a single card is wider than the whole content grid, still place at col 0
    const placeX = Math.min(cellX, Math.max(0, maxCellsX - wCells))
    let placeY = cellY

    // If we ran past bottom, keep packing downward (user can change margins/page)
    // but prefer to stay in-bounds when possible
    if (placeY + hCells > maxCellsY && cellY === 0) {
      placeY = 0
    }

    const x = originX + placeX * grid
    const y = originY + placeY * grid

    placed.push({
      ...item,
      x: Math.round(x),
      y: Math.round(y),
      // Keep original pixel size so content scale-to-fit still looks right
      autoFit: false,
    })

    cellX = placeX + wCells + gapCells
    rowHeightCells = Math.max(rowHeightCells, hCells)

    // If cursor ran off the right edge, advance row for next card
    if (cellX >= maxCellsX) {
      cellX = 0
      cellY += rowHeightCells + gapCells
      rowHeightCells = 0
    }
  }

  // Merge back by id so store identity stays stable
  const byId = new Map(placed.map((p) => [p.id, p]))
  return items.map((old) => {
    const n = byId.get(old.id)
    if (!n) return { ...old, autoFit: false }
    return {
      ...old,
      x: n.x,
      y: n.y,
      autoFit: false,
    }
  })
}
