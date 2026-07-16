/**
 * Board / print-frame workspace sizing helpers for the canvas store.
 */
import {
  multiPageLayoutBounds,
  normalizePrintPageLayout,
  resolvePagePixels,
  type PageOrientation,
  type PrintPageLayout,
  type PrintPageOrigin,
  type PrintSizeId,
} from '@/lib/printSizes'
import { FREEFORM_WORKSPACE, type SheetCanvas } from '@/types'

/** Padding around the free board (print frame off). */
const FREEFORM_PAD = 200

/**
 * Padding around print page layout when print frame is on.
 * Scrollable workspace is limited to the print stack + this pad.
 */
const PRINT_SCROLL_PAD = 96

/** Large freeform workspace (print frame off). */
export function freeformWorkspaceSize(
  width: number,
  height: number,
  extraMaxX = 0,
  extraMaxY = 0,
) {
  return {
    width: Math.max(
      FREEFORM_WORKSPACE.width,
      width,
      Math.ceil(extraMaxX) + FREEFORM_PAD,
    ),
    height: Math.max(
      FREEFORM_WORKSPACE.height,
      height,
      Math.ceil(extraMaxY) + FREEFORM_PAD,
    ),
  }
}

/**
 * Tight workspace = multi-page print layout bounds + pad.
 * Used when showPrintArea is on so pan/scroll cannot roam a 3200×2400 void.
 */
export function printFrameWorkspaceSize(bounds: {
  maxX: number
  maxY: number
  width: number
  height: number
}) {
  return {
    width: Math.max(
      Math.ceil(bounds.maxX) + PRINT_SCROLL_PAD,
      Math.ceil(bounds.width) + PRINT_SCROLL_PAD,
      320,
    ),
    height: Math.max(
      Math.ceil(bounds.maxY) + PRINT_SCROLL_PAD,
      Math.ceil(bounds.height) + PRINT_SCROLL_PAD,
      320,
    ),
  }
}

/**
 * Board size for current print config.
 * @param showPrint when true, clamp scroll area to page frames; when false, freeform.
 */
export function workspaceForPages(
  canvas: SheetCanvas,
  printSizeId: PrintSizeId,
  orientation: PageOrientation,
  pageCount: number,
  layout?: PrintPageLayout,
  freePositions?: PrintPageOrigin[] | null,
  showPrint?: boolean,
) {
  const page = resolvePagePixels(printSizeId, orientation)
  const mode = normalizePrintPageLayout(
    layout ?? canvas.printPageLayout ?? 'vertical',
  )
  const positions =
    freePositions !== undefined ? freePositions : canvas.printPagePositions
  // Dissolve: pages abutted (gap 0) so workspace matches outer super-page
  const dissolveGap =
    canvas.dissolvePrintArea === true && mode !== 'free' && pageCount > 1
      ? 0
      : undefined
  const bounds = multiPageLayoutBounds(
    page,
    pageCount,
    mode,
    positions,
    dissolveGap,
  )
  const printOn =
    showPrint !== undefined ? showPrint : canvas.showPrintArea !== false

  if (printOn) {
    return printFrameWorkspaceSize(bounds)
  }
  return freeformWorkspaceSize(
    canvas.width,
    canvas.height,
    bounds.maxX,
    bounds.maxY,
  )
}
