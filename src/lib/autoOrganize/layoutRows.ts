import type { CanvasItem, SheetCanvas } from '@/types'
import { DEFAULT_GAP, ORGANIZE_GRID } from './constants'
import { getContentBox } from './contentBox'

function snapUp(n: number, grid: number) {
  return Math.ceil(n / grid) * grid
}
function snapDown(n: number, grid: number) {
  return Math.floor(n / grid) * grid
}

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
