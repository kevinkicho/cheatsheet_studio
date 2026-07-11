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

/** Items on a page with positions relative to the page origin. */
export function itemsForPage(
  items: CanvasItem[],
  page: PageRect,
): Array<CanvasItem & { exportX: number; exportY: number }> {
  return items
    .filter((it) => itemIntersectsPage(it, page))
    .map((it) => ({
      ...it,
      exportX: it.x - page.x,
      exportY: it.y - page.y,
    }))
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
 * Wait for layout, fonts, KaTeX, and images inside a root before capture.
 * FigureView resolves local-asset: refs asynchronously — keep waiting while
 * "Loading…" placeholders are present or <img> nodes are incomplete.
 */
export async function waitForExportReady(
  root: HTMLElement,
  timeoutMs = 10000,
): Promise<void> {
  const start = Date.now()
  if (document.fonts?.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 2000)),
      ])
    } catch {
      /* ignore */
    }
  }

  // Allow React commit + KaTeX + FitContent layout effects
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await new Promise((r) => setTimeout(r, 50))

  while (Date.now() - start < timeoutMs) {
    const imgs = Array.from(root.querySelectorAll('img'))
    const pendingImgs = imgs.filter((img) => !img.complete)
    const stillLoadingText = /Loading…|Loading\.\.\./i.test(root.textContent ?? '')
    if (pendingImgs.length === 0 && !stillLoadingText) break

    if (pendingImgs.length > 0) {
      await Promise.all(
        pendingImgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', () => resolve(), { once: true })
              setTimeout(resolve, 1500)
            }),
        ),
      )
    } else {
      await new Promise((r) => setTimeout(r, 80))
    }
  }

  // Extra frame so FitContent scale settles after images/fonts
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await new Promise((r) => setTimeout(r, 60))
}
