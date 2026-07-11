/** Supported print-page export formats. */
export type ExportFormat = 'pdf' | 'png' | 'jpeg'

/** Raster color treatment after capture. */
export type ExportColorMode = 'color' | 'greyscale' | 'bw'

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
