/**
 * Library tile preview — root-cause model
 *
 * Confounding variables (what broke earlier attempts):
 *
 * 1. FitContent vs zoom cancel
 *    FitContent scales content to the box. Raising fontSize in a fixed box makes
 *    natural size larger, then FitContent shrinks harder → zoom % rises but paint
 *    stays similar (or flickers while remeasuring).
 *
 * 2. CSS scale(z) with width/height 100/z
 *    Intentionally cancels visual zoom; still triggers layout thrash.
 *
 * 3. % height inside overflow:auto
 *    h-full / min-h-full on children of overflow-auto often resolves to 0 when
 *    the only child is fillContainer (100% of 0 → empty figures).
 *
 * 4. FigureView fillContainer needs a non-zero host
 *    SVG at width/height 100% paints nothing without a laid-out pixel box.
 *
 * 5. Prose without fit at zoom=1
 *    Raw 14px multi-bullet lists overflow a ~11rem tile → looks “zoomed in badly”
 *    and clips. Default must fit-to-view; wheel zoom then enlarges deliberately.
 *
 * 6. One strategy for all kinds
 *    Prose = wrap + optional auto-fit at rest; math/figures = sized stage × zoom.
 *
 * 7. Math fit-to-view (maxScale high) + zoom via stage only
 *    Equations should fill the tile at rest (contain). Do NOT also scale
 *    baseFont with zoom — that cancels FitContent (font↑ → fit↓). Zoom =
 *    stage×zoom with a fixed base font so content grows with the stage.
 *
 * Contract:
 * - Well is measured in px (ResizeObserver).
 * - Math/figure stage = well × zoom (pixel box, never %).
 * - Prose width = well width (wrap); at zoom=1 auto-fit font so content fits;
 *   at zoom>1 font = base×zoom and may scroll (centered zoom anchor).
 * - Math: fixed base font + FitContent maxScale high (fit-to-view); stage×zoom.
 * - Figures: absolute fill of the px stage (SVG re-paints at host size).
 */

export const LIBRARY_ZOOM_MIN = 0.75
export const LIBRARY_ZOOM_MAX = 3.5
export const LIBRARY_ZOOM_STEP = 0.15
/** Default prose/math base before zoom / auto-fit. */
export const LIBRARY_BASE_FONT_PX = 12
/** Floor when auto-fitting prose into the tile at zoom=1. */
export const LIBRARY_PROSE_MIN_FIT = 0.5

export type LibraryPaintKind = 'prose' | 'math' | 'figure' | 'other'

export function clampLibraryZoom(z: number): number {
  return Math.min(
    LIBRARY_ZOOM_MAX,
    Math.max(LIBRARY_ZOOM_MIN, Math.round(z * 20) / 20),
  )
}

export function libraryFontSize(zoom: number, fitScale = 1): number {
  const z = clampLibraryZoom(zoom)
  const fit = Math.min(1, Math.max(LIBRARY_PROSE_MIN_FIT, fitScale))
  return Math.max(9, Math.round(LIBRARY_BASE_FONT_PX * z * fit))
}

export function libraryStageSize(
  wellW: number,
  wellH: number,
  zoom: number,
): { w: number; h: number } {
  const z = clampLibraryZoom(zoom)
  return {
    w: Math.max(48, Math.round(wellW * z)),
    h: Math.max(48, Math.round(wellH * z)),
  }
}

/**
 * Keep a content point under the cursor after zoom changes scrollable area.
 * `cursorClientX/Y` are viewport coords from the wheel event; omit them to
 * fall back to the visual center (legacy).
 */
export function scrollAfterZoomAtPoint(
  el: HTMLElement,
  prevZoom: number,
  nextZoom: number,
  cursorClientX?: number,
  cursorClientY?: number,
): void {
  if (prevZoom <= 0 || nextZoom <= 0) return
  const ratio = nextZoom / prevZoom
  const rect = el.getBoundingClientRect()
  const hasCursor =
    typeof cursorClientX === 'number' &&
    typeof cursorClientY === 'number' &&
    Number.isFinite(cursorClientX) &&
    Number.isFinite(cursorClientY)
  // Offset of focal point inside the visible well
  const viewX = hasCursor
    ? cursorClientX! - rect.left
    : el.clientWidth / 2
  const viewY = hasCursor
    ? cursorClientY! - rect.top
    : el.clientHeight / 2
  // Content coords under that point (scroll + viewport offset)
  const contentX = el.scrollLeft + viewX
  const contentY = el.scrollTop + viewY
  requestAnimationFrame(() => {
    const maxL = Math.max(0, el.scrollWidth - el.clientWidth)
    const maxT = Math.max(0, el.scrollHeight - el.clientHeight)
    if (maxL <= 1 && maxT <= 1) {
      el.scrollLeft = 0
      el.scrollTop = 0
      return
    }
    // Keep the same content point under the cursor after scale
    el.scrollLeft = Math.min(
      maxL,
      Math.max(0, contentX * ratio - viewX),
    )
    el.scrollTop = Math.min(
      maxT,
      Math.max(0, contentY * ratio - viewY),
    )
  })
}

/** @deprecated prefer scrollAfterZoomAtPoint — center-only zoom. */
export function centerScrollAfterZoom(
  el: HTMLElement,
  prevZoom: number,
  nextZoom: number,
): void {
  scrollAfterZoomAtPoint(el, prevZoom, nextZoom)
}
