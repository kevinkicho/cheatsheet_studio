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
  clampRasterScale,
  MAX_SAFE_CANVAS_PIXELS,
  triggerBlobDownload,
  yieldToUi,
} from '@/lib/exportCapture'
import { zipBlobs } from '@/lib/exportZip'
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
  /**
   * When true, combined multi-page export stacks pages with inter-page margin
   * gutters collapsed (continuous printable strip). Matches Auto-layout
   * “Dissolve print pages” max-space packing.
   */
  dissolvePrintArea?: boolean
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
  // Raster defaults: PDF can stay a bit sharper (JPEG pages are small).
  // PNG/JPEG full multipage at ≥1.5× often OOM'd or hung encode for a minute+
  // (silent tab death). SVG stays vector (no scale cost).
  const scale =
    options.scale ??
    (format === 'png' || format === 'jpeg'
      ? 1.25
      : format === 'pdf'
        ? 1.5
        : 2)
  const jpegQuality = options.jpegQuality ?? 0.88
  const colorMode = options.colorMode ?? 'color'
  const showGrid = options.showGrid === true
  const backgroundMode = options.backgroundMode ?? 'transparent'
  const packageMode = options.packageMode ?? 'combined'
  const pageArrangement = options.pageArrangement ?? 'vertical'
  const dissolvePrintArea = options.dissolvePrintArea === true
  // Custom stem or sheet title (sanitizeExportFilename applied at write)
  const downloadTitle =
    (options.fileName && options.fileName.trim()) || title || 'cheatsheet'
  const dissolveGutterPx = dissolvePrintArea
    ? (canvas.margins?.top ?? 48) + (canvas.margins?.bottom ?? 48)
    : 0

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
    // E11: short global wait (fonts + first paint). Per-page ready runs in
    // captureJob so multipage does not block 14s×all Mermaid before page 1.
    const readyMs =
      format === 'png' || format === 'jpeg'
        ? 5000
        : format === 'pdf'
          ? 8000
          : 14000
    await waitForExportReady(host, readyMs, {
      waitFonts: true,
      settleMs: format === 'svg' ? 120 : 60,
    })
    // Brief settle for Mermaid paintStudioSvg layout effect + FO metrics
    if (format === 'svg') {
      await new Promise((r) => setTimeout(r, 120))
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
        dissolveGutterPx,
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
  // E11: wait only this page’s images/Mermaid (fonts already waited globally)
  await waitForExportReady(job.el, 6000, {
    waitFonts: false,
    settleMs: 40,
  })
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
      try {
        canvasEl.width = 0
        canvasEl.height = 0
      } catch {
        /* ignore */
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
    try {
      canvasEl.width = 0
      canvasEl.height = 0
    } catch {
      /* ignore */
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
  dissolveGutterPx = 0,
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
      dissolveGutterPx,
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

  // Capture → encode → free each page so multipage exports don't hold every
  // full-res canvas in memory (main cause of silent tab death on PNG/JPEG).
  const releaseCanvas = (c: HTMLCanvasElement | null | undefined) => {
    if (!c) return
    try {
      c.width = 0
      c.height = 0
    } catch {
      /* ignore */
    }
  }

  // Per-page scale so a single letter page stays under the safe pixel budget
  const pageScale = (() => {
    let s = scale
    for (const j of jobs) {
      s = Math.min(
        s,
        clampRasterScale(j.rect.width, j.rect.height, s, MAX_SAFE_CANVAS_PIXELS),
      )
    }
    return s
  })()

  // Honor UI package mode exactly:
  //   combined → one long (vertical stack) or one big (sheet layout) image
  //   separate → one image per page (multipage packs into a single .zip)
  if (packageMode === 'combined' && jobs.length > 1) {
    await writeImagesCombined(
      jobs,
      title,
      format,
      itemCount,
      pageScale,
      jpegQuality,
      colorMode,
      bg,
      mime,
      pageArrangement,
      onProgress,
      releaseCanvas,
    )
    return
  }

  await writeImagesSeparate(
    jobs,
    title,
    format,
    itemCount,
    pageScale,
    jpegQuality,
    colorMode,
    bg,
    mime,
    onProgress,
    releaseCanvas,
  )
}

/**
 * One long/big PNG/JPEG — respects packageMode “All together”.
 * Shrinks scale to fit the pixel budget instead of silently switching to
 * page-by-page (user chose combined).
 */
async function writeImagesCombined(
  jobs: PageJob[],
  title: string,
  format: 'png' | 'jpeg',
  itemCount: number,
  scale: number,
  jpegQuality: number,
  colorMode: ExportColorMode,
  bg: string | null,
  mime: 'image/png' | 'image/jpeg',
  pageArrangement: ExportPageArrangement,
  onProgress: ((p: SheetExportProgress) => void) | undefined,
  releaseCanvas: (c: HTMLCanvasElement | null | undefined) => void,
) {
  // Fit the *stitched* image under budget by reducing capture scale
  const budget =
    format === 'png' ? MAX_SAFE_CANVAS_PIXELS * 0.85 : MAX_SAFE_CANVAS_PIXELS
  let stitchScale = scale
  for (let guard = 0; guard < 12; guard++) {
    const est = estimateStitchPixels(jobs, stitchScale, pageArrangement)
    if (est <= budget) break
    stitchScale = Math.max(0.5, stitchScale * Math.sqrt(budget / est) * 0.98)
  }
  // Also keep each page capture under budget
  for (const j of jobs) {
    stitchScale = Math.min(
      stitchScale,
      clampRasterScale(j.rect.width, j.rect.height, stitchScale, budget),
    )
  }

  const layoutHint =
    pageArrangement === 'vertical' ? 'long strip' : 'sheet layout'
  onProgress?.({
    phase: 'write',
    totalPages: jobs.length,
    itemCount,
    format,
    message: `Building one ${format.toUpperCase()} (${layoutHint}, ${jobs.length} pages)…`,
  })

  let stitched: HTMLCanvasElement | null = null
  try {
    stitched = await streamStitchPages(
      jobs,
      stitchScale,
      colorMode,
      bg,
      pageArrangement,
      (i) => {
        onProgress?.({
          phase: 'capture',
          page: i + 1,
          totalPages: jobs.length,
          itemCount,
          format,
          message: `Capturing page ${i + 1} of ${jobs.length} (combined)…`,
        })
      },
    )
    onProgress?.({
      phase: 'write',
      totalPages: jobs.length,
      itemCount,
      format,
      message: `Encoding combined ${format.toUpperCase()}…`,
    })
    await yieldToUi(16)
    const blob = await canvasToBlob(
      stitched,
      mime,
      jpegQuality,
      format === 'png' ? 35_000 : 20_000,
    )
    releaseCanvas(stitched)
    stitched = null
    const filename = sanitizeExportFilename(title, format)
    triggerBlobDownload(blob, filename)
    onProgress?.({
      phase: 'done',
      totalPages: jobs.length,
      itemCount,
      format,
      message: doneMessage(filename, itemCount, jobs.length),
    })
  } catch (err) {
    releaseCanvas(stitched)
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Combined ${format.toUpperCase()} failed: ${msg}. ` +
        `Try “Page by page”, fewer pages, JPEG, or SVG/PDF.`,
    )
  }
}

async function writeImagesSeparate(
  jobs: PageJob[],
  title: string,
  format: 'png' | 'jpeg',
  itemCount: number,
  scale: number,
  jpegQuality: number,
  colorMode: ExportColorMode,
  bg: string | null,
  mime: 'image/png' | 'image/jpeg',
  onProgress: ((p: SheetExportProgress) => void) | undefined,
  releaseCanvas: (c: HTMLCanvasElement | null | undefined) => void,
) {
  // Collect blobs then download once. Chromium often silently blocks the 2nd+
  // blob download after long async work (user-gesture expired) — felt like
  // “export hung and never saved”. Multipage → one .zip; single → direct file.
  const files: Array<{ name: string; blob: Blob }> = []

  for (let i = 0; i < jobs.length; i++) {
    const { label } = jobs[i]!
    onProgress?.({
      phase: 'capture',
      page: i + 1,
      totalPages: jobs.length,
      itemCount,
      format,
      message: `Capturing page ${i + 1} of ${jobs.length}…`,
    })
    let canvasEl: HTMLCanvasElement | null = null
    try {
      const s = clampRasterScale(
        jobs[i]!.rect.width,
        jobs[i]!.rect.height,
        scale,
      )
      canvasEl = await captureJob(jobs[i]!, i, s, colorMode, bg)
      onProgress?.({
        phase: 'write',
        page: i + 1,
        totalPages: jobs.length,
        itemCount,
        format,
        message: `Encoding page ${i + 1} of ${jobs.length}…`,
      })
      await yieldToUi(16)
      const blob = await canvasToBlob(
        canvasEl,
        mime,
        jpegQuality,
        format === 'png' ? 18_000 : 15_000,
      )
      releaseCanvas(canvasEl)
      canvasEl = null
      // If encode emergency-fell-back to JPEG bytes, keep a matching extension
      const ext =
        blob.type === 'image/jpeg' || blob.type === 'image/jpg'
          ? 'jpeg'
          : format
      const filename =
        jobs.length > 1
          ? sanitizeExportFilename(title, ext, label)
          : sanitizeExportFilename(title, ext)
      files.push({ name: filename, blob })
    } catch (err) {
      releaseCanvas(canvasEl)
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `PNG/JPEG export failed on page ${i + 1}/${jobs.length}: ${msg}. ` +
          `Try fewer pages, SVG/PDF, or close other tabs.`,
      )
    }
    if (i < jobs.length - 1) {
      await yieldToUi(40)
    }
  }

  onProgress?.({
    phase: 'write',
    totalPages: jobs.length,
    itemCount,
    format,
    message:
      files.length > 1
        ? `Packing ${files.length} pages into ZIP…`
        : 'Saving…',
  })
  await yieldToUi(16)

  if (files.length === 1) {
    const f = files[0]!
    triggerBlobDownload(f.blob, f.name)
    onProgress?.({
      phase: 'done',
      totalPages: jobs.length,
      itemCount,
      format,
      message: doneMessage(f.name, itemCount, 1),
    })
    return
  }

  // One download — avoids multi-download permission / silent drop
  const zipName = sanitizeExportFilename(title, 'zip')
  const zipBlob = await zipBlobs(files)
  triggerBlobDownload(zipBlob, zipName)
  onProgress?.({
    phase: 'done',
    totalPages: jobs.length,
    itemCount,
    format,
    message: `Saved ${zipName} (${files.length} ${format.toUpperCase()} pages) — check Downloads`,
  })
}

function estimateStitchPixels(
  jobs: PageJob[],
  scale: number,
  arrangement: ExportPageArrangement,
): number {
  if (jobs.length === 0) return 0
  if (arrangement === 'vertical') {
    const w = Math.max(...jobs.map((j) => j.rect.width)) * scale
    const h = jobs.reduce((s, j) => s + j.rect.height * scale, 0)
    return Math.max(1, Math.round(w * h))
  }
  const minX = Math.min(...jobs.map((j) => j.rect.x))
  const minY = Math.min(...jobs.map((j) => j.rect.y))
  const maxX = Math.max(...jobs.map((j) => j.rect.x + j.rect.width))
  const maxY = Math.max(...jobs.map((j) => j.rect.y + j.rect.height))
  return Math.max(
    1,
    Math.round((maxX - minX) * scale * ((maxY - minY) * scale)),
  )
}

/**
 * Grow canvas height if a later page is taller than the estimate (E10).
 */
function ensureCanvasMinHeight(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  minH: number,
  backgroundColor: string | null,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (canvas.height >= minH) return { canvas, ctx }
  const next = document.createElement('canvas')
  next.width = canvas.width
  next.height = minH
  const nctx = next.getContext('2d')
  if (!nctx) return { canvas, ctx }
  if (backgroundColor) {
    nctx.fillStyle = backgroundColor
    nctx.fillRect(0, 0, next.width, next.height)
  }
  nctx.drawImage(canvas, 0, 0)
  try {
    canvas.width = 0
    canvas.height = 0
  } catch {
    /* ignore */
  }
  return { canvas: next, ctx: nctx }
}

/**
 * Capture pages one-by-one and draw into a single canvas, releasing each
 * page canvas immediately (avoids multi-GB multipage PNG/JPEG OOM).
 * Vertical stitch uses **actual** page pixel heights (E10), not estimate-only.
 */
async function streamStitchPages(
  jobs: PageJob[],
  scale: number,
  colorMode: ExportColorMode,
  backgroundColor: string | null,
  arrangement: ExportPageArrangement,
  onPage?: (index: number) => void,
): Promise<HTMLCanvasElement> {
  if (jobs.length === 0) {
    throw new Error('No pages to stitch')
  }

  onPage?.(0)
  const first = await captureJob(jobs[0]!, 0, scale, colorMode, backgroundColor)
  const scaleX = first.width / Math.max(1, jobs[0]!.rect.width)
  const scaleY = first.height / Math.max(1, jobs[0]!.rect.height)

  if (arrangement === 'vertical') {
    // Start with estimated total height; grow if later pages are taller
    let outW = first.width
    let estH = Math.round(
      jobs.reduce((s, j, i) => {
        if (i === 0) return s + first.height
        return s + j.rect.height * scaleY
      }, 0),
    )
    if (outW * estH > MAX_SAFE_CANVAS_PIXELS * 1.25) {
      try {
        first.width = 0
        first.height = 0
      } catch {
        /* ignore */
      }
      throw new Error(
        `Combined image too large (~${outW}×${estH}px). Use “Page by page” or export fewer pages.`,
      )
    }

    let out = document.createElement('canvas')
    out.width = outW
    out.height = Math.max(1, estH)
    let ctx = out.getContext('2d')
    if (!ctx) {
      try {
        first.width = 0
        first.height = 0
      } catch {
        /* ignore */
      }
      throw new Error('Could not create export canvas')
    }
    if (backgroundColor) {
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, out.width, out.height)
    }

    let y = 0
    {
      outW = Math.max(outW, first.width)
      if (out.width < outW) {
        // widen rare: recreate
        const grown = document.createElement('canvas')
        grown.width = outW
        grown.height = out.height
        const gctx = grown.getContext('2d')!
        if (backgroundColor) {
          gctx.fillStyle = backgroundColor
          gctx.fillRect(0, 0, grown.width, grown.height)
        }
        gctx.drawImage(out, 0, 0)
        try {
          out.width = 0
          out.height = 0
        } catch {
          /* ignore */
        }
        out = grown
        ctx = gctx
      }
      const dx = Math.max(0, Math.round((outW - first.width) / 2))
      const needH = y + first.height
      ;({ canvas: out, ctx } = ensureCanvasMinHeight(
        out,
        ctx,
        needH,
        backgroundColor,
      ))
      ctx.drawImage(first, dx, y)
      y += first.height
      try {
        first.width = 0
        first.height = 0
      } catch {
        /* ignore */
      }
    }

    for (let i = 1; i < jobs.length; i++) {
      onPage?.(i)
      await yieldToUi(8)
      const page = await captureJob(
        jobs[i]!,
        i,
        scale,
        colorMode,
        backgroundColor,
      )
      try {
        outW = Math.max(outW, page.width)
        if (out.width < outW) {
          const grown = document.createElement('canvas')
          grown.width = outW
          grown.height = out.height
          const gctx = grown.getContext('2d')!
          if (backgroundColor) {
            gctx.fillStyle = backgroundColor
            gctx.fillRect(0, 0, grown.width, grown.height)
          }
          gctx.drawImage(out, 0, 0)
          try {
            out.width = 0
            out.height = 0
          } catch {
            /* ignore */
          }
          out = grown
          ctx = gctx
        }
        const needH = y + page.height
        ;({ canvas: out, ctx } = ensureCanvasMinHeight(
          out,
          ctx,
          needH,
          backgroundColor,
        ))
        if (outW * out.height > MAX_SAFE_CANVAS_PIXELS * 1.35) {
          throw new Error(
            `Combined image too large (${outW}×${out.height}px). Use “Page by page” or export fewer pages.`,
          )
        }
        const dx = Math.max(0, Math.round((outW - page.width) / 2))
        ctx.drawImage(page, dx, y)
        y += page.height
      } finally {
        try {
          page.width = 0
          page.height = 0
        } catch {
          /* ignore */
        }
      }
    }

    // Trim unused bottom if estimate overshot
    if (y > 0 && y < out.height) {
      const trimmed = document.createElement('canvas')
      trimmed.width = out.width
      trimmed.height = y
      const tctx = trimmed.getContext('2d')
      if (tctx) {
        tctx.drawImage(out, 0, 0)
        try {
          out.width = 0
          out.height = 0
        } catch {
          /* ignore */
        }
        return trimmed
      }
    }
    return out
  }

  // asSheet: place pages at relative board positions (estimate scale from first)
  const minX = Math.min(...jobs.map((j) => j.rect.x))
  const minY = Math.min(...jobs.map((j) => j.rect.y))
  const maxX = Math.max(...jobs.map((j) => j.rect.x + j.rect.width))
  const maxY = Math.max(...jobs.map((j) => j.rect.y + j.rect.height))
  const outW = Math.max(1, Math.round((maxX - minX) * scaleX))
  const outH = Math.max(1, Math.round((maxY - minY) * scaleY))
  if (outW * outH > MAX_SAFE_CANVAS_PIXELS * 1.25) {
    try {
      first.width = 0
      first.height = 0
    } catch {
      /* ignore */
    }
    throw new Error(
      `Combined image too large (${outW}×${outH}px). Use “Page by page” or export fewer pages.`,
    )
  }

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const ctx = out.getContext('2d')
  if (!ctx) {
    try {
      first.width = 0
      first.height = 0
    } catch {
      /* ignore */
    }
    throw new Error('Could not create export canvas')
  }
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, outW, outH)
  }

  {
    const dx = Math.round((jobs[0]!.rect.x - minX) * scaleX)
    const dy = Math.round((jobs[0]!.rect.y - minY) * scaleY)
    ctx.drawImage(first, dx, dy)
    try {
      first.width = 0
      first.height = 0
    } catch {
      /* ignore */
    }
  }

  for (let i = 1; i < jobs.length; i++) {
    onPage?.(i)
    await yieldToUi(8)
    const page = await captureJob(jobs[i]!, i, scale, colorMode, backgroundColor)
    try {
      const dx = Math.round((jobs[i]!.rect.x - minX) * scaleX)
      const dy = Math.round((jobs[i]!.rect.y - minY) * scaleY)
      ctx.drawImage(page, dx, dy)
    } finally {
      try {
        page.width = 0
        page.height = 0
      } catch {
        /* ignore */
      }
    }
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
