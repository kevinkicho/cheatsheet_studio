import {
  clampGridOpacity,
  normalizeGridExtent,
  type GridExtent,
} from '@/types'

/**
 * Which grid layers should render for the current print / extent settings.
 *
 * Critical invariants (locked by unit tests):
 * - Board and per-page grids are mutually exclusive.
 * - When print frame is off, only the board grid can show.
 * - Extent `board` with print on → board grid only.
 * - Extent `page` | `printable` with print on → per-page grids only.
 */
export function resolveGridCoverage(input: {
  showGrid: boolean
  showPrintArea: boolean
  gridExtent: unknown
}): {
  extent: GridExtent
  useBoardGrid: boolean
  usePerPageGrid: boolean
} {
  const extent = normalizeGridExtent(input.gridExtent)
  const showGrid = input.showGrid === true
  const showPrint = input.showPrintArea !== false

  const useBoardGrid = showGrid && (!showPrint || extent === 'board')
  const usePerPageGrid = showGrid && showPrint && extent !== 'board'

  return { extent, useBoardGrid, usePerPageGrid }
}

/**
 * CSS opacity applied to the shared grid tile layer.
 * Must be identical for board / page / printable — only geometry differs.
 */
export function gridLayerCssOpacity(storedOpacity: unknown): number {
  return clampGridOpacity(storedOpacity)
}

/**
 * Geometry for a per-page grid tile (full page vs printable content box).
 */
export function resolvePageGridRect(
  extent: GridExtent,
  pageOrigin: { x: number; y: number },
  page: { width: number; height: number },
  margins: { top: number; right: number; bottom: number; left: number },
): { left: number; top: number; width: number; height: number } | null {
  if (extent === 'board') return null

  if (extent === 'page') {
    return {
      left: pageOrigin.x,
      top: pageOrigin.y,
      width: page.width,
      height: page.height,
    }
  }

  // printable
  const width = Math.max(0, page.width - margins.left - margins.right)
  const height = Math.max(0, page.height - margins.top - margins.bottom)
  if (width < 1 || height < 1) return null
  return {
    left: pageOrigin.x + margins.left,
    top: pageOrigin.y + margins.top,
    width,
    height,
  }
}
