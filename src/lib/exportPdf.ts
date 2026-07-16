import type { CanvasItem, SheetCanvas } from '@/types'
import { DEFAULT_MARGINS } from '@/types'
import {
  clampPrintPageCount,
  computePrintPageOrigins,
  getPrintPageSize,
  normalizePrintPageLayout,
} from '@/lib/printSizes'

export type PageRect = {
  index: number
  x: number
  y: number
  width: number
  height: number
}

/** Print page rectangles in board coordinates. */
export function getExportPageRects(canvas: SheetCanvas): PageRect[] {
  const page = getPrintPageSize(
    canvas.printSizeId ?? 'letter',
    canvas.orientation ?? 'portrait',
  )
  const count = clampPrintPageCount(canvas.printPageCount ?? 1)
  const layout = normalizePrintPageLayout(canvas.printPageLayout)
  const origins = computePrintPageOrigins(
    page,
    count,
    layout,
    canvas.printPagePositions,
  )
  return origins.map((o, index) => ({
    index,
    x: o.x,
    y: o.y,
    width: page.width,
    height: page.height,
  }))
}

/** True if item bounding box intersects page (inclusive overlap). */
export function itemIntersectsPage(
  item: Pick<CanvasItem, 'x' | 'y' | 'width' | 'height' | 'hidden'>,
  page: PageRect,
): boolean {
  if (item.hidden) return false
  const right = item.x + item.width
  const bottom = item.y + item.height
  return (
    item.x < page.x + page.width &&
    right > page.x &&
    item.y < page.y + page.height &&
    bottom > page.y
  )
}

/**
 * Stabilize flags for export paint. Equations/tables: natural KaTeX size
 * (contentFill false) — force-fill caused letterbox gutters vs export 19.
 * Process/figures keep fill. Always clear autoFit (export has no measure loop).
 */
export function normalizeItemForExport(it: CanvasItem): CanvasItem {
  const isEq =
    it.type === 'equation' ||
    it.type === 'custom-equation' ||
    Boolean(it.latex)
  const isTbl = it.type === 'table' || Boolean(it.tableMarkdown)
  const isProc =
    it.type === 'process-chart' || Boolean(it.mermaidSource || it.processFlow)
  const isFig =
    it.type === 'figure' ||
    it.type === 'custom-image' ||
    (Boolean(it.imageUrl) && !it.latex && !it.tableMarkdown)
  if (isEq || isTbl) {
    return { ...it, autoFit: false, contentFill: false }
  }
  if (isProc || isFig) {
    return { ...it, autoFit: false, contentFill: true }
  }
  return { ...it, autoFit: false }
}

/** Items on a page with positions relative to the page origin. */
export function itemsForPage(
  items: CanvasItem[],
  page: PageRect,
): Array<CanvasItem & { exportX: number; exportY: number }> {
  return items
    .filter((it) => itemIntersectsPage(it, page))
    .map((it) => {
      const n = normalizeItemForExport(it)
      return {
        ...n,
        exportX: n.x - page.x,
        exportY: n.y - page.y,
      }
    })
    .sort((a, b) => a.zIndex - b.zIndex)
}

/** @deprecated Prefer sanitizeExportFilename(title, 'pdf') */
export function sanitizePdfFilename(title: string): string {
  return sanitizeExportFilename(title, 'pdf')
}

/**
 * Safe download basename with extension.
 * @param page 1-based page index for multi-file image exports (appends `-pN`).
 */
export function sanitizeExportFilename(
  title: string,
  extension: string,
  page?: number,
): string {
  const base = (title || 'cheatsheet').trim().slice(0, 80)
  const safe = base.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').trim()
  const stem = safe || 'cheatsheet'
  const ext = extension.replace(/^\./, '').toLowerCase() || 'bin'
  const pageSuffix =
    page != null && page > 0 ? `-p${page}` : ''
  return `${stem}${pageSuffix}.${ext}`
}

export function getExportMargins(canvas: SheetCanvas) {
  return { ...DEFAULT_MARGINS, ...canvas.margins }
}

/**
 * True when Mermaid process charts in the export root still need time.
 * Studio canvas can show finished SVGs while export clone is mid-render —
 * without this wait, PDF/PNG cheatsheets capture empty process cards.
 */
export function isMermaidExportPending(root: HTMLElement): boolean {
  const text = root.textContent ?? ''
  if (/Rendering…|Rendering\.\.\./i.test(text)) return true
  if (/Mermaid error:/i.test(text)) return false

  const hosts = Array.from(
    root.querySelectorAll<HTMLElement>('[data-testid="mermaid-view"]'),
  )
  if (hosts.length === 0) {
    // Process cards with mermaid source still mounting (no host yet)
    const needsMermaid = root.querySelectorAll(
      '[data-export-needs-mermaid="1"]',
    ).length
    return needsMermaid > 0
  }

  for (const host of hosts) {
    if (host.getAttribute('data-mermaid-ready') === 'true') {
      const svg = host.querySelector('svg')
      if (svg) continue
    }
    const svg = host.querySelector('svg')
    if (!svg) return true
    const vb = svg.viewBox?.baseVal
    const hasGeom =
      (vb && vb.width > 2 && vb.height > 2) ||
      svg.getBoundingClientRect().width > 2 ||
      (svg.children?.length ?? 0) > 0
    if (!hasGeom) return true
  }
  return false
}

/**
 * Wait for layout, fonts, KaTeX, images, and Mermaid process charts before capture.
 * FigureView resolves local-asset: refs asynchronously — keep waiting while
 * "Loading…" placeholders are present or <img> nodes are incomplete.
 * MermaidView is async (renderMermaidSvg) — without waiting, export shows empty
 * flowchart/mindmap cards that look fine on the live Studio canvas.
 */
export async function waitForExportReady(
  root: HTMLElement,
  timeoutMs = 14000,
  opts?: {
    /** When false, skip document.fonts wait (already done globally). */
    waitFonts?: boolean
    /** Settle delay after ready (default 120). */
    settleMs?: number
  },
): Promise<void> {
  const start = Date.now()
  const waitFonts = opts?.waitFonts !== false
  const settleMs = opts?.settleMs ?? 120

  if (waitFonts && document.fonts?.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 2000)),
      ])
    } catch {
      /* ignore */
    }
  }

  // Allow React commit + KaTeX + FitContent + Mermaid mount
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await new Promise((r) => setTimeout(r, 40))

  while (Date.now() - start < timeoutMs) {
    const imgs = Array.from(root.querySelectorAll('img'))
    const pendingImgs = imgs.filter((img) => !img.complete)
    const stillLoadingText = /Loading…|Loading\.\.\./i.test(root.textContent ?? '')
    const mermaidPending = isMermaidExportPending(root)
    if (pendingImgs.length === 0 && !stillLoadingText && !mermaidPending) break

    if (pendingImgs.length > 0) {
      await Promise.all(
        pendingImgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', () => resolve(), { once: true })
              setTimeout(resolve, 1200)
            }),
        ),
      )
    } else {
      await new Promise((r) => setTimeout(r, 80))
    }
  }

  // Extra frames so FitContent / SVG viewBox settle after mermaid paint
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  if (settleMs > 0) {
    await new Promise((r) => setTimeout(r, settleMs))
  }
}
