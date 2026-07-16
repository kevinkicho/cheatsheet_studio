/**
 * DOM capture helpers for sheet export.
 * Uses html2canvas-pro (oklch / lab / color() support — needed for Tailwind v4).
 */
import html2canvas from 'html2canvas-pro'
import type { PageRect } from '@/lib/exportPdf'
import type { ExportColorMode } from '@/lib/exportFormats'

export type CaptureOptions = {
  scale?: number
  /**
   * Page fill behind transparent areas.
   * Pass `null` for a fully transparent page (PNG). Defaults to studio board.
   */
  backgroundColor?: string | null
  colorMode?: ExportColorMode
}

/**
 * Mutate RGBA pixel buffer (length multiple of 4) for greyscale / B&W.
 * Rec. 709 luminance; B&W uses threshold 140 (~55%).
 */
export function transformRgbaPixels(
  data: Uint8ClampedArray | number[],
  mode: ExportColorMode,
  thr = 140,
): void {
  if (mode === 'color') return
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!
    if (mode === 'greyscale') {
      const g = Math.round(y)
      data[i] = g
      data[i + 1] = g
      data[i + 2] = g
    } else {
      const v = y >= thr ? 255 : 0
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
    }
  }
}

/**
 * Convert a captured page canvas to greyscale or pure black & white in place.
 * Returns the same canvas for chaining.
 */
export function applyColorMode(
  canvas: HTMLCanvasElement,
  mode: ExportColorMode = 'color',
): HTMLCanvasElement {
  if (mode === 'color') return canvas
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || typeof ctx.getImageData !== 'function') return canvas
  const { width, height } = canvas
  if (width === 0 || height === 0) return canvas
  try {
    const image = ctx.getImageData(0, 0, width, height)
    transformRgbaPixels(image.data, mode)
    ctx.putImageData(image, 0, 0)
  } catch {
    // jsdom / tainted canvas — leave as-is
  }
  return canvas
}

/** Soft browser canvas budget (~16MP is safe; larger often freezes encode). */
export const MAX_SAFE_CANVAS_PIXELS = 12_000_000

/** Hard cap so html2canvas cannot hang the tab indefinitely. */
export const CAPTURE_TIMEOUT_MS = 45_000

/**
 * Clamp raster scale so width×height×scale² stays under a pixel budget.
 * Prevents silent tab OOM / hung PNG encode on multipage or dense sheets.
 */
export function clampRasterScale(
  width: number,
  height: number,
  scale: number,
  maxPixels = MAX_SAFE_CANVAS_PIXELS,
): number {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const s = Math.max(0.5, scale)
  const px = w * h * s * s
  if (px <= maxPixels) return s
  const next = Math.sqrt(maxPixels / (w * h))
  // Prefer ≥0.75 for print quality, but honor the pixel budget (hard floor 0.5)
  return Math.max(0.5, Math.min(s, next))
}

/**
 * Run a promise with a timeout (clears timer on settle).
 */
export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label = 'Operation',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after ${Math.round(ms / 1000)}s. Try fewer pages, SVG/PDF, or close other tabs.`,
        ),
      )
    }, ms)
    p.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

/**
 * Downscale a canvas so width×height ≤ maxPixels (returns original if already small).
 * Used before PNG encode — huge canvases freeze `toBlob`/`toDataURL` for minutes.
 */
export function downscaleCanvasToBudget(
  canvas: HTMLCanvasElement,
  maxPixels = MAX_SAFE_CANVAS_PIXELS,
): HTMLCanvasElement {
  const w = canvas.width
  const h = canvas.height
  if (w < 1 || h < 1) return canvas
  const px = w * h
  if (px <= maxPixels) return canvas
  const s = Math.sqrt(maxPixels / px)
  const nw = Math.max(1, Math.round(w * s))
  const nh = Math.max(1, Math.round(h * s))
  const out = document.createElement('canvas')
  out.width = nw
  out.height = nh
  const ctx = out.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, nw, nh)
  return out
}

/**
 * Capture a single print-page element to a canvas.
 * Throws a clear error if modern CSS still fails to parse.
 *
 * Capture **in place** (do not reparent). Reparenting into an isolation host
 * broke html2canvas-pro with “Unable to find element in cloned iframe” —
 * combined PNG/JPEG multipage failed after the first page.
 */
export async function capturePageElement(
  el: HTMLElement,
  rect: PageRect,
  options: CaptureOptions = {},
): Promise<HTMLCanvasElement> {
  // Clamp scale so capture canvas stays under safe pixel budget
  const rawScale = options.scale ?? 1.25
  const scale = clampRasterScale(rect.width, rect.height, rawScale)
  // null = transparent (html2canvas); undefined option falls back to board
  const backgroundColor =
    options.backgroundColor === null
      ? null
      : (options.backgroundColor ?? '#0f1115')
  const colorMode = options.colorMode ?? 'color'

  const runCapture = (allowTaint: boolean) =>
    html2canvas(el, {
      backgroundColor: backgroundColor as string | null | undefined,
      scale,
      useCORS: true,
      allowTaint,
      logging: false,
      width: rect.width,
      height: rect.height,
      windowWidth: rect.width,
      windowHeight: rect.height,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      // Figures already loaded in waitForExportReady
      imageTimeout: 4000,
      removeContainer: true,
    })

  const formatCaptureError = (err: unknown): Error => {
    const msg = err instanceof Error ? err.message : String(err)
    if (/unsupported color function|oklch|oklab|color\(/i.test(msg)) {
      return new Error(
        'Export failed: browser/CSS color not supported by the capture engine. Try reloading the app after updating.',
      )
    }
    if (/taint|security|cross-origin/i.test(msg)) {
      return new Error(
        'Export blocked by a cross-origin image. Re-import figures as local files.',
      )
    }
    if (/cloned iframe|find element/i.test(msg)) {
      return new Error(
        'Page capture failed (export DOM). Try again, or use Page by page / SVG / PDF.',
      )
    }
    if (msg.includes('timed out')) return new Error(msg)
    if (msg.includes('Attempting to parse')) {
      return new Error(`Export capture failed: ${msg}`)
    }
    return new Error(`Could not capture page: ${msg}`)
  }

  const isTaintOrCorsError = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err)
    return /taint|security|cross-origin|unable to get image data|cannot read/i.test(
      msg,
    )
  }

  let canvas: HTMLCanvasElement
  try {
    canvas = await withTimeout(
      runCapture(false),
      CAPTURE_TIMEOUT_MS,
      'Page capture',
    )
  } catch (first) {
    // E6: only re-run full html2canvas with allowTaint when the failure looks
    // like CORS/taint — not on timeout, CSS parse, or iframe clone errors
    // (2× capture cost was a major multipage hang).
    if (!isTaintOrCorsError(first)) {
      throw formatCaptureError(first)
    }
    try {
      canvas = await withTimeout(
        runCapture(true),
        CAPTURE_TIMEOUT_MS,
        'Page capture (retry)',
      )
      // Probe taint before color-mode readback (JPEG is cheaper than PNG)
      canvas.toDataURL('image/jpeg', 0.5)
    } catch (second) {
      throw formatCaptureError(second)
    }
  }

  // Keep encode under budget (html2canvas can still overshoot slightly)
  canvas = downscaleCanvasToBudget(canvas, MAX_SAFE_CANVAS_PIXELS)
  return applyColorMode(canvas, colorMode)
}

function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
  if (!m) throw new Error('Failed to encode image (bad data URL)')
  const mime = m[1] || 'application/octet-stream'
  const bin = atob(m[2]!)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * Encode canvas → Blob. `toBlob` can hang forever or return null on huge
 * canvases; race a timeout and fall back to `toDataURL`.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: 'image/png' | 'image/jpeg',
  quality = 0.92,
  timeoutMs = 25_000,
): Promise<Blob> {
  // Downscale first — encoding a 20MP PNG is what freezes the tab for a minute+
  const src = downscaleCanvasToBudget(canvas, MAX_SAFE_CANVAS_PIXELS)
  const w = src.width
  const h = src.height
  if (w < 1 || h < 1) {
    return Promise.reject(new Error('Failed to encode image (empty canvas)'))
  }

  // PNG encode is much slower than JPEG at the same pixel count — tighter
  // budget for lossless so toBlob/toDataURL stay interactive.
  const encodeCanvas =
    mime === 'image/png'
      ? downscaleCanvasToBudget(src, Math.min(MAX_SAFE_CANVAS_PIXELS, 8_000_000))
      : src

  const q = mime === 'image/jpeg' ? quality : undefined

  const viaDataUrl = (): Blob => {
    try {
      // Prefer JPEG path for emergency fallback when PNG encode is too heavy
      if (mime === 'image/png' && encodeCanvas.width * encodeCanvas.height > 6_000_000) {
        const url = encodeCanvas.toDataURL('image/jpeg', 0.9)
        return dataUrlToBlob(url)
      }
      const url = encodeCanvas.toDataURL(mime, q)
      return dataUrlToBlob(url)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/taint|security|cross-origin/i.test(msg)) {
        throw new Error(
          'Export blocked by a cross-origin image. Re-import figures as local files.',
        )
      }
      throw new Error(`Failed to encode image: ${msg}`)
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      try {
        fn()
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }

    // Shorter timeout for PNG — fall back before the UI looks frozen
    const wait = Math.max(
      4_000,
      mime === 'image/png' ? Math.min(timeoutMs, 18_000) : timeoutMs,
    )
    const timer = window.setTimeout(() => {
      finish(() => {
        // toBlob never called back — common OOM/hang path
        resolve(viaDataUrl())
      })
    }, wait)

    try {
      encodeCanvas.toBlob(
        (blob) => {
          finish(() => {
            window.clearTimeout(timer)
            if (blob && blob.size > 0) {
              resolve(blob)
              return
            }
            // null blob → try sync encode
            resolve(viaDataUrl())
          })
        },
        // If PNG emergency path produced jpeg data URL type, keep requested mime
        // for toBlob first attempt
        mime,
        q,
      )
    } catch {
      finish(() => {
        window.clearTimeout(timer)
        resolve(viaDataUrl())
      })
    }
  })
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    // Must stay in user-gesture stack when possible; still works after await
    // in Chromium if we use a short delay before revoke only.
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

/** Yield so the export dialog can paint progress between heavy pages. */
export function yieldToUi(ms = 0): Promise<void> {
  return new Promise((r) => {
    if (ms > 0) {
      window.setTimeout(r, ms)
      return
    }
    requestAnimationFrame(() => r())
  })
}
