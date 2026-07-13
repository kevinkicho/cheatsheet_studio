import type { ItemStyle, SheetCanvas } from './types'

/** Letter portrait @ 96dpi (matches app printSizes letter). */
export const LETTER_PX = { width: 816, height: 1056 } as const

export const DEFAULT_MARGINS = {
  top: 48,
  right: 48,
  bottom: 48,
  left: 48,
} as const

export const DEFAULT_BORDER_COLOR = 'rgba(99, 102, 241, 0.55)'

export const DEFAULT_ITEM_STYLE: ItemStyle = {
  fontSize: 18,
  titleFontSize: 10,
  color: '#e8eaed',
  background: 'rgba(30, 32, 40, 0.92)',
  borderEnabled: true,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: DEFAULT_BORDER_COLOR,
  border: `1px solid ${DEFAULT_BORDER_COLOR}`,
  padding: 0,
}

const PRINT_PAD = 96

/** Matches app DEFAULT_CANVAS (print frame on, letter). */
export function defaultCanvas(
  overrides?: Partial<SheetCanvas>,
): SheetCanvas {
  return {
    width: LETTER_PX.width + PRINT_PAD,
    height: LETTER_PX.height + PRINT_PAD,
    background: '#0f1115',
    showGrid: true,
    snapToGrid: false,
    gridSpacing: 24,
    gridOpacity: 0.09,
    gridExtent: 'page',
    printSizeId: 'letter',
    orientation: 'portrait',
    showPrintArea: true,
    printPageCount: 1,
    printPageLayout: 'vertical',
    printPagePositions: [],
    margins: { ...DEFAULT_MARGINS },
    ...overrides,
  }
}

/** Printable content box origin/size for page 0 (vertical stack). */
export function printableContentBox(canvas: SheetCanvas): {
  x: number
  y: number
  width: number
  height: number
} {
  const m = canvas.margins
  // Page frame at origin for single-page vertical layout
  return {
    x: m.left,
    y: m.top,
    width: LETTER_PX.width - m.left - m.right,
    height: LETTER_PX.height - m.top - m.bottom,
  }
}
