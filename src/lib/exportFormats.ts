/** Supported print-page export formats. */
export type ExportFormat = 'pdf' | 'png' | 'jpeg' | 'svg'

/** Raster color treatment after capture. */
export type ExportColorMode = 'color' | 'greyscale' | 'bw'

/** Page paper / board fill in the export. */
export type ExportBackgroundMode = 'transparent' | 'asShown'

/**
 * How selected pages are arranged in a combined export / preview stack.
 * - asSheet: use print layout from page settings (vertical / horizontal / grid / free)
 * - vertical: stack selected pages top-to-bottom
 */
export type ExportPageArrangement = 'asSheet' | 'vertical'

/**
 * One download vs one file per page.
 * PDF “combined” = multi-page PDF; “separate” = one PDF per page.
 * PNG/JPEG “combined” = one stitched image; “separate” = one image per page.
 * SVG “combined” = pages stacked in one SVG; “separate” = one SVG per page.
 */
export type ExportPackageMode = 'combined' | 'separate'

export const EXPORT_FORMATS: {
  id: ExportFormat
  label: string
  description: string
  extension: string
  mime: string
}[] = [
  {
    id: 'pdf',
    label: 'PDF',
    description: 'Multi-page document (print-ready)',
    extension: 'pdf',
    mime: 'application/pdf',
  },
  {
    id: 'svg',
    label: 'SVG',
    description: 'Vector (sharp zoom; KaTeX + diagrams)',
    extension: 'svg',
    mime: 'image/svg+xml',
  },
  {
    id: 'png',
    label: 'PNG',
    description: 'Lossless image per page',
    extension: 'png',
    mime: 'image/png',
  },
  {
    id: 'jpeg',
    label: 'JPEG',
    description: 'Compressed photo-style image per page',
    extension: 'jpeg',
    mime: 'image/jpeg',
  },
]

export const EXPORT_COLOR_MODES: {
  id: ExportColorMode
  label: string
  description: string
  /** CSS filter for live preview (approximate). */
  previewFilter: string
}[] = [
  {
    id: 'color',
    label: 'Color',
    description: 'Full color (as on the sheet)',
    previewFilter: 'none',
  },
  {
    id: 'greyscale',
    label: 'Greyscale',
    description: 'Shades of grey',
    previewFilter: 'grayscale(1)',
  },
  {
    id: 'bw',
    label: 'Black & white',
    description: 'High-contrast ink (threshold)',
    previewFilter: 'grayscale(1) contrast(8) brightness(1.05)',
  },
]

export function exportFormatMeta(format: ExportFormat) {
  return EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0]!
}

export function exportColorModeMeta(mode: ExportColorMode) {
  return EXPORT_COLOR_MODES.find((m) => m.id === mode) ?? EXPORT_COLOR_MODES[0]!
}

export const EXPORT_BACKGROUND_MODES: {
  id: ExportBackgroundMode
  label: string
  description: string
}[] = [
  {
    id: 'transparent',
    label: 'Transparent',
    description: 'No page fill (best for overlays / slides)',
  },
  {
    id: 'asShown',
    label: 'As shown',
    description: 'Board background color from the sheet',
  },
]

export const EXPORT_ARRANGEMENTS: {
  id: ExportPageArrangement
  label: string
  description: string
}[] = [
  {
    id: 'vertical',
    label: 'Stack vertical',
    description: 'Selected pages one under another',
  },
  {
    id: 'asSheet',
    label: 'Page settings',
    description: 'Use print layout (grid / free / horizontal…)',
  },
]

export const EXPORT_PACKAGE_MODES: {
  id: ExportPackageMode
  label: string
  description: string
}[] = [
  {
    id: 'combined',
    label: 'All together',
    description:
      'One file: PDF multi-page, one long/big PNG/JPEG (stack or sheet layout), or one multi-page SVG',
  },
  {
    id: 'separate',
    label: 'Page by page',
    description:
      'One image/PDF/SVG per page (multipage PNG/JPEG packs into one .zip download)',
  },
]
