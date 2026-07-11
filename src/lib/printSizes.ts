/**
 * Print page presets rendered on the canvas at 96 CSS px per inch
 * (standard browser mapping for print-like layouts).
 */
export type PrintSizeId =
  | 'letter'
  | 'legal'
  | 'tabloid'
  | 'a3'
  | 'a4'
  | 'a5'
  | 'custom'

export type PageOrientation = 'portrait' | 'landscape'

export interface PrintSizePreset {
  id: PrintSizeId
  label: string
  /** Short label for the top bar */
  shortLabel: string
  description: string
  /** Physical size string for UI */
  physical: string
  /** Portrait width in px @ 96dpi */
  widthIn: number
  /** Portrait height in px @ 96dpi */
  heightIn: number
}

const IN = 96 // px per inch

export const PRINT_SIZE_PRESETS: PrintSizePreset[] = [
  {
    id: 'letter',
    label: 'US Letter',
    shortLabel: 'Letter',
    description: 'Standard US letter paper',
    physical: '8.5 × 11 in',
    widthIn: 8.5 * IN,
    heightIn: 11 * IN,
  },
  {
    id: 'legal',
    label: 'US Legal',
    shortLabel: 'Legal',
    description: 'US legal paper',
    physical: '8.5 × 14 in',
    widthIn: 8.5 * IN,
    heightIn: 14 * IN,
  },
  {
    id: 'tabloid',
    label: 'Tabloid',
    shortLabel: 'Tabloid',
    description: 'Ledger / tabloid',
    physical: '11 × 17 in',
    widthIn: 11 * IN,
    heightIn: 17 * IN,
  },
  {
    id: 'a4',
    label: 'A4',
    shortLabel: 'A4',
    description: 'ISO A4 (most common outside US)',
    physical: '210 × 297 mm',
    widthIn: Math.round((210 / 25.4) * IN),
    heightIn: Math.round((297 / 25.4) * IN),
  },
  {
    id: 'a3',
    label: 'A3',
    shortLabel: 'A3',
    description: 'ISO A3',
    physical: '297 × 420 mm',
    widthIn: Math.round((297 / 25.4) * IN),
    heightIn: Math.round((420 / 25.4) * IN),
  },
  {
    id: 'a5',
    label: 'A5',
    shortLabel: 'A5',
    description: 'ISO A5 (half of A4)',
    physical: '148 × 210 mm',
    widthIn: Math.round((148 / 25.4) * IN),
    heightIn: Math.round((210 / 25.4) * IN),
  },
]

export const DEFAULT_PRINT_SIZE_ID: PrintSizeId = 'letter'
export const DEFAULT_ORIENTATION: PageOrientation = 'portrait'

export function getPrintPreset(id: PrintSizeId): PrintSizePreset | undefined {
  return PRINT_SIZE_PRESETS.find((p) => p.id === id)
}

export function resolvePagePixels(
  printSizeId: PrintSizeId = DEFAULT_PRINT_SIZE_ID,
  orientation: PageOrientation = DEFAULT_ORIENTATION,
  customWidth?: number,
  customHeight?: number,
): { width: number; height: number } {
  if (printSizeId === 'custom') {
    return {
      width: Math.max(200, customWidth ?? 816),
      height: Math.max(200, customHeight ?? 1056),
    }
  }

  const preset = getPrintPreset(printSizeId) ?? getPrintPreset('letter')!
  const w = Math.round(preset.widthIn)
  const h = Math.round(preset.heightIn)
  if (orientation === 'landscape') {
    return { width: h, height: w }
  }
  return { width: w, height: h }
}

export function formatPageSizeLabel(
  printSizeId: PrintSizeId,
  orientation: PageOrientation,
): string {
  if (printSizeId === 'custom') return 'Custom'
  const preset = getPrintPreset(printSizeId)
  if (!preset) return 'Letter'
  const ori = orientation === 'landscape' ? ' Landscape' : ''
  return `${preset.shortLabel}${ori}`
}

/** Print page pixel size for the current preset (independent of workspace size). */
export function getPrintPageSize(
  printSizeId: PrintSizeId = DEFAULT_PRINT_SIZE_ID,
  orientation: PageOrientation = DEFAULT_ORIENTATION,
): { width: number; height: number } {
  return resolvePagePixels(printSizeId, orientation)
}
