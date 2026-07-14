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
import type {
  ExportBackgroundMode,
  ExportColorMode,
  ExportFormat,
  ExportPackageMode,
  ExportPageArrangement,
} from '@/lib/exportFormats'
import { exportFormatMeta } from '@/lib/exportFormats'
import {
  downloadSvgString,
  pageElementToSvgString,
  stitchSvgPages,
  svgFilename,
} from '@/lib/exportSvg'

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
  /** Draw sheet grid in export (default false). */
  showGrid?: boolean
  /** Page fill: transparent (default) or board background. */
  backgroundMode?: ExportBackgroundMode
  /**
   * How pages are ordered in a combined raster stitch / preview.
   * PDF multi-page always one page per print frame.
   */
  pageArrangement?: ExportPageArrangement
  /**
   * combined = one file (PDF multi-page or stitched image).
   * separate = one file per page.
   */
  packageMode?: ExportPackageMode
  /**
   * Download basename without extension (sanitized). Defaults to sheet title.
   * Browser still appends “ (n)” if the same name already exists in Downloads.
   */
  fileName?: string
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
  const showGrid = options.showGrid === true
  const backgroundMode = options.backgroundMode ?? 'transparent'
  const packageMode = options.packageMode ?? 'combined'
  const pageArrangement = options.pageArrangement ?? 'vertical'
  // Custom stem or sheet title (sanitizeExportFilename applied at write)
  const downloadTitle =
    (options.fileName && options.fileName.trim()) || title || 'cheatsheet'

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

  const originalIndices = selected

  const itemCount = new Set(models.flatMap((m) => m.items.map((i) => i.id)))
    .size
  const visibleOnBoard = items.filter((i) => !i.hidden).length

  if (itemCount === 0 && visibleOnBoard > 0) {
    throw new Error(
      'No cards are on the selected print page(s). Move cards onto the dashed page frame, or select different pages.',
    )
  }

  // Export canvas clone: grid + background modes
  // SVG: always use board dark (file:// white paper is unusable for dark cards)
  const forceDarkBoard = format === 'svg'
  const exportCanvas: SheetCanvas = {
    ...canvas,
    showGrid,
    background:
      forceDarkBoard || backgroundMode !== 'transparent'
        ? canvas.background || '#0f1115'
        : 'transparent',
  }
  const captureBg: string | null =
    forceDarkBoard || backgroundMode !== 'transparent'
      ? exportCanvas.background || '#0f1115'
      : null

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
  // Off-screen but painted (z-index:-1 can yield blank html2canvas / SVG captures)
  host.style.cssText = [
    'position:fixed',
    'left:-12000px',
    'top:0',
    'z-index:0',
    'pointer-events:none',
    'opacity:1',
    'visibility:visible',
  ].join(';')
  document.body.appendChild(host)

  let root: Root | null = createRoot(host)
  try {
    flushSync(() => {
      root!.render(
        createElement(PdfExportPages, {
          pages: models,
          canvas: exportCanvas,
        }),
      )
    })
    await waitForExportReady(host)
    // Brief settle for Mermaid paintStudioSvg layout effect + FO metrics
    if (format === 'svg') {
      await new Promise((r) => setTimeout(r, 180))
    }

    const pageEls = Array.from(
      host.querySelectorAll<HTMLElement>('[data-pdf-page]'),
    )
    if (pageEls.length === 0) {
      throw new Error('Export pages failed to render')
    }

    const jobs = pageEls.map((el, i) => ({
      el,
      rect: pageRects[i]!,
      label: originalIndices[i]! + 1,
    }))

    if (format === 'pdf') {
      await writePdf(
        jobs,
        downloadTitle,
        itemCount,
        scale,
        colorMode,
        captureBg,
        packageMode,
        onProgress,
      )
    } else if (format === 'svg') {
      await writeSvg(
        jobs,
        downloadTitle,
        itemCount,
        colorMode,
        captureBg,
        packageMode,
        pageArrangement,
        onProgress,
      )
    } else {
      await writeImages(
        jobs,
        downloadTitle,
        format,
        itemCount,
        scale,
        jpegQuality,
        colorMode,
        captureBg,
        packageMode,
        pageArrangement,
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

async function captureJob(
  job: PageJob,
  i: number,
  scale: number,
  colorMode: ExportColorMode,
  backgroundColor: string | null,
): Promise<HTMLCanvasElement> {
  return capturePageElement(
    job.el,
    {
      index: i,
      x: 0,
      y: 0,
      width: job.rect.width,
      height: job.rect.height,
    },
    {
      scale,
      colorMode,
      backgroundColor,
    },
  )
}

async function writePdf(
  jobs: PageJob[],
  title: string,
  itemCount: number,
  scale: number,
  colorMode: ExportColorMode,
  backgroundColor: string | null,
  packageMode: ExportPackageMode,
  onProgress?: (p: SheetExportProgress) => void,
) {
  const pxToPt = 0.75
  // PDF uses JPEG pages — transparent bg becomes dark; use board if transparent
  const bg = backgroundColor === null ? '#0f1115' : backgroundColor

  if (packageMode === 'separate') {
    const saved: string[] = []
    for (let i = 0; i < jobs.length; i++) {
      const { rect, label } = jobs[i]!
      onProgress?.({
        phase: 'capture',
        page: i + 1,
        totalPages: jobs.length,
        itemCount,
        format: 'pdf',
        message: `Capturing page ${i + 1} of ${jobs.length}…`,
      })
      const canvasEl = await captureJob(jobs[i]!, i, scale, colorMode, bg)
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
      const pdf = new jsPDF({
        orientation: wPt > hPt ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [wPt, hPt],
        compress: true,
      })
      pdf.addImage(img, 'JPEG', 0, 0, wPt, hPt, undefined, 'FAST')
      const filename =
        jobs.length > 1
          ? sanitizeExportFilename(title, 'pdf', label)
          : sanitizeExportFilename(title, 'pdf')
      triggerBlobDownload(pdf.output('blob'), filename)
      saved.push(filename)
      if (i < jobs.length - 1) await new Promise((r) => setTimeout(r, 150))
    }
    onProgress?.({
      phase: 'done',
      totalPages: jobs.length,
      itemCount,
      format: 'pdf',
      message:
        saved.length === 1
          ? doneMessage(saved[0]!, itemCount, 1)
          : `Saved ${saved.length} PDF files — check Downloads`,
    })
    return
  }

  // Combined multi-page PDF
  const first = jobs[0]!.rect
  const pdf = new jsPDF({
    orientation: first.width > first.height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [first.width * pxToPt, first.height * pxToPt],
    compress: true,
  })

  for (let i = 0; i < jobs.length; i++) {
    const { rect } = jobs[i]!
    onProgress?.({
      phase: 'capture',
      page: i + 1,
      totalPages: jobs.length,
      itemCount,
      format: 'pdf',
      message: `Capturing page ${i + 1} of ${jobs.length}…`,
    })

    const canvasEl = await captureJob(jobs[i]!, i, scale, colorMode, bg)
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

/**
 * Vector SVG export — serializes the already-rendered export DOM (KaTeX + Mermaid)
 * into SVG foreignObject so zoom stays sharp (unlike PNG/JPEG).
 *
 * packageMode:
 * - combined (“All together”) → one stitched SVG (pages stacked)
 * - separate (“Page by page”) → one download per page
 */
async function writeSvg(
  jobs: PageJob[],
  title: string,
  itemCount: number,
  colorMode: ExportColorMode,
  backgroundColor: string | null,
  packageMode: ExportPackageMode,
  pageArrangement: ExportPageArrangement,
  onProgress?: (p: SheetExportProgress) => void,
) {
  const bg = backgroundColor
  const pageSvgs: string[] = []

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!
    onProgress?.({
      phase: 'capture',
      page: i + 1,
      totalPages: jobs.length,
      itemCount,
      format: 'svg',
      message: `Building SVG page ${i + 1} of ${jobs.length} (capturing diagrams)…`,
    })
    const svg = await pageElementToSvgString(job.el, {
      width: job.rect.width,
      height: job.rect.height,
      backgroundColor: bg,
      colorMode,
      title: jobs.length > 1 ? `${title} · p${job.label}` : title,
      diagramScale: 2,
    })
    pageSvgs.push(svg)
  }

  if (packageMode === 'combined' && pageSvgs.length > 1) {
    onProgress?.({
      phase: 'write',
      totalPages: jobs.length,
      itemCount,
      format: 'svg',
      message: 'Stitching pages into one SVG…',
    })
    const combined = stitchSvgPages(pageSvgs, {
      title,
      arrangement: pageArrangement === 'asSheet' ? 'asSheet' : 'vertical',
      origins: jobs.map((j) => ({ x: j.rect.x, y: j.rect.y })),
      backgroundColor: bg,
    })
    const filename = svgFilename(title)
    downloadSvgString(combined, filename)
    onProgress?.({
      phase: 'done',
      totalPages: jobs.length,
      itemCount,
      format: 'svg',
      message: doneMessage(filename, itemCount, jobs.length),
    })
    return
  }

  const saved: string[] = []
  for (let i = 0; i < pageSvgs.length; i++) {
    const job = jobs[i]!
    onProgress?.({
      phase: 'write',
      page: i + 1,
      totalPages: jobs.length,
      itemCount,
      format: 'svg',
      message: `Saving SVG page ${i + 1}…`,
    })
    const filename =
      pageSvgs.length > 1 ? svgFilename(title, job.label) : svgFilename(title)
    downloadSvgString(pageSvgs[i]!, filename)
    saved.push(filename)
    if (i < pageSvgs.length - 1) {
      await new Promise((r) => setTimeout(r, 120))
    }
  }

  onProgress?.({
    phase: 'done',
    totalPages: jobs.length,
    itemCount,
    format: 'svg',
    message:
      saved.length === 1
        ? doneMessage(saved[0]!, itemCount, 1)
        : `Saved ${saved.length} SVG files — check Downloads`,
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
  backgroundColor: string | null,
  packageMode: ExportPackageMode,
  pageArrangement: ExportPageArrangement,
  onProgress?: (p: SheetExportProgress) => void,
) {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  // JPEG has no alpha — transparent falls back to board
  const bg =
    format === 'jpeg' && backgroundColor === null
      ? '#0f1115'
      : backgroundColor

  const captured: HTMLCanvasElement[] = []
  for (let i = 0; i < jobs.length; i++) {
    onProgress?.({
      phase: 'capture',
      page: i + 1,
      totalPages: jobs.length,
      itemCount,
      format,
      message: `Capturing page ${i + 1} of ${jobs.length}…`,
    })
    captured.push(await captureJob(jobs[i]!, i, scale, colorMode, bg))
  }

  if (packageMode === 'combined' && jobs.length > 1) {
    onProgress?.({
      phase: 'write',
      totalPages: jobs.length,
      itemCount,
      format,
      message: 'Stitching pages…',
    })
    const stitched = stitchCanvases(captured, jobs, pageArrangement, bg)
    const blob = await canvasToBlob(stitched, mime, jpegQuality)
    const filename = sanitizeExportFilename(title, format)
    triggerBlobDownload(blob, filename)
    onProgress?.({
      phase: 'done',
      totalPages: jobs.length,
      itemCount,
      format,
      message: doneMessage(filename, itemCount, jobs.length),
    })
    return
  }

  const saved: string[] = []
  for (let i = 0; i < captured.length; i++) {
    const { label } = jobs[i]!
    onProgress?.({
      phase: 'write',
      page: i + 1,
      totalPages: jobs.length,
      itemCount,
      format,
      message: `Saving page ${i + 1}…`,
    })
    const blob = await canvasToBlob(captured[i]!, mime, jpegQuality)
    const filename =
      jobs.length > 1
        ? sanitizeExportFilename(title, format, label)
        : sanitizeExportFilename(title, format)
    triggerBlobDownload(blob, filename)
    saved.push(filename)
    if (i < captured.length - 1) {
      await new Promise((r) => setTimeout(r, 150))
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

/** Stitch page captures into one image (vertical stack or sheet layout). */
function stitchCanvases(
  pages: HTMLCanvasElement[],
  jobs: PageJob[],
  arrangement: ExportPageArrangement,
  backgroundColor: string | null,
): HTMLCanvasElement {
  if (pages.length === 1) return pages[0]!

  if (arrangement === 'vertical') {
    const w = Math.max(...pages.map((p) => p.width))
    const h = pages.reduce((s, p) => s + p.height, 0)
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')!
    if (backgroundColor) {
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, w, h)
    }
    let y = 0
    for (const p of pages) {
      ctx.drawImage(p, 0, y)
      y += p.height
    }
    return out
  }

  // asSheet: place pages at relative board positions
  const minX = Math.min(...jobs.map((j) => j.rect.x))
  const minY = Math.min(...jobs.map((j) => j.rect.y))
  const maxX = Math.max(...jobs.map((j) => j.rect.x + j.rect.width))
  const maxY = Math.max(...jobs.map((j) => j.rect.y + j.rect.height))
  const boardW = maxX - minX
  const boardH = maxY - minY
  const scale = pages[0]!.width / jobs[0]!.rect.width
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(boardW * scale))
  out.height = Math.max(1, Math.round(boardH * scale))
  const ctx = out.getContext('2d')!
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, out.width, out.height)
  }
  for (let i = 0; i < pages.length; i++) {
    const j = jobs[i]!
    const dx = Math.round((j.rect.x - minX) * scale)
    const dy = Math.round((j.rect.y - minY) * scale)
    ctx.drawImage(pages[i]!, dx, dy)
  }
  return out
}

function doneMessage(filename: string, itemCount: number, pages: number) {
  const cards =
    itemCount === 0
      ? 'empty'
      : `${itemCount} card${itemCount === 1 ? '' : 's'}`
  const pagePart = pages > 1 ? `, ${pages} pages` : ''
  return `Saved ${filename} (${cards}${pagePart})`
}
