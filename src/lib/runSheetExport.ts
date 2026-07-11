import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { jsPDF } from 'jspdf'
import type { CanvasItem, SheetCanvas } from '@/types'
import {
  getExportPageRects,
  itemsForPage,
  sanitizeExportFilename,
  waitForExportReady,
  type PageRect,
} from '@/lib/exportPdf'
import {
  PdfExportPages,
  type ExportPageModel,
} from '@/components/export/PdfExportPages'
import {
  capturePageElement,
  canvasToBlob,
  triggerBlobDownload,
} from '@/lib/exportCapture'
import type { ExportColorMode, ExportFormat } from '@/lib/exportFormats'
import { exportFormatMeta } from '@/lib/exportFormats'

export type SheetExportProgress = {
  phase: 'prepare' | 'capture' | 'write' | 'done' | 'error'
  page?: number
  totalPages?: number
  itemCount?: number
  format?: ExportFormat
  message?: string
}

export type SheetExportOptions = {
  format: ExportFormat
  /** Raster scale for PNG/JPEG/PDF page images (default 2). */
  scale?: number
  /** JPEG quality 0–1 (default 0.92). */
  jpegQuality?: number
  /**
   * 0-based print page indices to include. Defaults to all pages.
   * Invalid indices are ignored; empty selection throws.
   */
  pageIndices?: number[]
  /** Color treatment after capture (default color). */
  colorMode?: ExportColorMode
}

/** Normalize and clamp selected page indices against total page count. */
export function resolveExportPageIndices(
  totalPages: number,
  pageIndices?: number[],
): number[] {
  if (totalPages <= 0) return []
  if (!pageIndices || pageIndices.length === 0) {
    return Array.from({ length: totalPages }, (_, i) => i)
  }
  const set = new Set<number>()
  for (const i of pageIndices) {
    const n = Math.floor(i)
    if (n >= 0 && n < totalPages) set.add(n)
  }
  return Array.from(set).sort((a, b) => a - b)
}

/**
 * Export print page frames as PDF (multi-page) or PNG/JPEG (one file per page).
 */
export async function runSheetExport(
  canvas: SheetCanvas,
  items: CanvasItem[],
  title: string,
  options: SheetExportOptions,
  onProgress?: (p: SheetExportProgress) => void,
): Promise<void> {
  const format = options.format
  const meta = exportFormatMeta(format)
  const scale = options.scale ?? 2
  const jpegQuality = options.jpegQuality ?? 0.92
  const colorMode = options.colorMode ?? 'color'

  const allRects = getExportPageRects(canvas)
  if (allRects.length === 0) {
    throw new Error('No print pages to export')
  }

  const selected = resolveExportPageIndices(allRects.length, options.pageIndices)
  if (selected.length === 0) {
    throw new Error('Select at least one page to export')
  }

  const pageRects = selected.map((i) => allRects[i]!)
  const models: ExportPageModel[] = pageRects.map((page) => ({
    page,
    items: itemsForPage(items, page),
  }))

  // Preserve original page numbers in data attribute for labeling
  const originalIndices = selected

  const itemCount = new Set(models.flatMap((m) => m.items.map((i) => i.id)))
    .size
  const visibleOnBoard = items.filter((i) => !i.hidden).length

  if (itemCount === 0 && visibleOnBoard > 0) {
    throw new Error(
      'No cards are on the selected print page(s). Move cards onto the dashed page frame, or select different pages.',
    )
  }

  onProgress?.({
    phase: 'prepare',
    totalPages: models.length,
    itemCount,
    format,
    message:
      itemCount === 0
        ? `Preparing empty ${meta.label}…`
        : `Preparing ${itemCount} card${itemCount === 1 ? '' : 's'} · ${models.length} page${models.length === 1 ? '' : 's'} as ${meta.label}…`,
  })

  const host = document.createElement('div')
  host.setAttribute('data-pdf-export-host', 'true')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'z-index:-1',
    'pointer-events:none',
    'opacity:1',
  ].join(';')
  document.body.appendChild(host)

  let root: Root | null = createRoot(host)
  try {
    flushSync(() => {
      root!.render(createElement(PdfExportPages, { pages: models }))
    })
    await waitForExportReady(host)

    const pageEls = Array.from(
      host.querySelectorAll<HTMLElement>('[data-pdf-page]'),
    )
    if (pageEls.length === 0) {
      throw new Error('Export pages failed to render')
    }

    // Pair DOM pages with board rects + original 1-based labels
    const jobs = pageEls.map((el, i) => ({
      el,
      rect: pageRects[i]!,
      label: originalIndices[i]! + 1,
    }))

    if (format === 'pdf') {
      await writePdf(jobs, title, itemCount, scale, colorMode, onProgress)
    } else {
      await writeImages(
        jobs,
        title,
        format,
        itemCount,
        scale,
        jpegQuality,
        colorMode,
        onProgress,
      )
    }
  } finally {
    try {
      root?.unmount()
    } catch {
      /* ignore */
    }
    root = null
    host.remove()
  }
}

/** @deprecated Use runSheetExport({ format: 'pdf' }) */
export async function runPdfExport(
  canvas: SheetCanvas,
  items: CanvasItem[],
  title: string,
  onProgress?: (p: SheetExportProgress) => void,
): Promise<void> {
  return runSheetExport(canvas, items, title, { format: 'pdf' }, onProgress)
}

type PageJob = {
  el: HTMLElement
  rect: PageRect
  /** 1-based original page number for filenames */
  label: number
}

async function writePdf(
  jobs: PageJob[],
  title: string,
  itemCount: number,
  scale: number,
  colorMode: ExportColorMode,
  onProgress?: (p: SheetExportProgress) => void,
) {
  const first = jobs[0]!.rect
  const landscape = first.width > first.height
  const pxToPt = 0.75
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [first.width * pxToPt, first.height * pxToPt],
    compress: true,
  })

  for (let i = 0; i < jobs.length; i++) {
    const { el, rect } = jobs[i]!
    onProgress?.({
      phase: 'capture',
      page: i + 1,
      totalPages: jobs.length,
      itemCount,
      format: 'pdf',
      message: `Capturing page ${i + 1} of ${jobs.length}…`,
    })

    const canvasEl = await capturePageElement(
      el,
      {
        index: i,
        x: 0,
        y: 0,
        width: rect.width,
        height: rect.height,
      },
      { scale, colorMode },
    )

    let img: string
    try {
      img = canvasEl.toDataURL('image/jpeg', 0.92)
    } catch {
      throw new Error(
        'PDF capture was blocked by the browser (cross-origin image). Re-import figures or use local images.',
      )
    }

    const wPt = rect.width * pxToPt
    const hPt = rect.height * pxToPt
    if (i > 0) {
      pdf.addPage([wPt, hPt], wPt > hPt ? 'landscape' : 'portrait')
    }
    pdf.addImage(img, 'JPEG', 0, 0, wPt, hPt, undefined, 'FAST')
  }

  onProgress?.({
    phase: 'write',
    totalPages: jobs.length,
    itemCount,
    format: 'pdf',
    message: 'Saving PDF…',
  })

  const filename = sanitizeExportFilename(title, 'pdf')
  triggerBlobDownload(pdf.output('blob'), filename)

  onProgress?.({
    phase: 'done',
    totalPages: jobs.length,
    itemCount,
    format: 'pdf',
    message: doneMessage(filename, itemCount, jobs.length),
  })
}

async function writeImages(
  jobs: PageJob[],
  title: string,
  format: 'png' | 'jpeg',
  itemCount: number,
  scale: number,
  jpegQuality: number,
  colorMode: ExportColorMode,
  onProgress?: (p: SheetExportProgress) => void,
) {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  const multi = jobs.length > 1
  const saved: string[] = []

  for (let i = 0; i < jobs.length; i++) {
    const { el, rect, label } = jobs[i]!
    onProgress?.({
      phase: 'capture',
      page: i + 1,
      totalPages: jobs.length,
      itemCount,
      format,
      message: `Capturing page ${i + 1} of ${jobs.length}…`,
    })

    const canvasEl = await capturePageElement(
      el,
      {
        index: i,
        x: 0,
        y: 0,
        width: rect.width,
        height: rect.height,
      },
      { scale, colorMode },
    )

    onProgress?.({
      phase: 'write',
      page: i + 1,
      totalPages: jobs.length,
      itemCount,
      format,
      message: `Saving page ${i + 1}…`,
    })

    const blob = await canvasToBlob(canvasEl, mime, jpegQuality)
    // Use original page numbers in multi-file names when not exporting all sequentially
    const filename = multi
      ? sanitizeExportFilename(title, format, label)
      : sanitizeExportFilename(title, format)
    triggerBlobDownload(blob, filename)
    saved.push(filename)

    if (multi && i < jobs.length - 1) {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  onProgress?.({
    phase: 'done',
    totalPages: jobs.length,
    itemCount,
    format,
    message:
      saved.length === 1
        ? doneMessage(saved[0]!, itemCount, 1)
        : `Saved ${saved.length} ${format.toUpperCase()} files — check Downloads`,
  })
}

function doneMessage(filename: string, itemCount: number, pages: number) {
  const cards =
    itemCount === 0
      ? 'empty'
      : `${itemCount} card${itemCount === 1 ? '' : 's'}`
  const pagePart = pages > 1 ? `, ${pages} pages` : ''
  return `Saved ${filename} (${cards}${pagePart})`
}
