/**
 * DOM capture helpers for sheet export.
 * Uses html2canvas-pro (oklch / lab / color() support — needed for Tailwind v4).
 */
import html2canvas from 'html2canvas-pro'
import type { PageRect } from '@/lib/exportPdf'
import type { ExportColorMode } from '@/lib/exportFormats'

export type CaptureOptions = {
  scale?: number
  /** White paper background */
  backgroundColor?: string
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

/**
 * Capture a single print-page element to a canvas.
 * Throws a clear error if modern CSS still fails to parse.
 */
export async function capturePageElement(
  el: HTMLElement,
  rect: PageRect,
  options: CaptureOptions = {},
): Promise<HTMLCanvasElement> {
  const scale = options.scale ?? 2
  const backgroundColor = options.backgroundColor ?? '#ffffff'
  const colorMode = options.colorMode ?? 'color'

  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(el, {
      backgroundColor,
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: rect.width,
      height: rect.height,
      windowWidth: rect.width,
      windowHeight: rect.height,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      // Prefer image decoding for figures
      imageTimeout: 15000,
    })
  } catch (first) {
    // Retry with allowTaint for blob:/local figures
    try {
      canvas = await html2canvas(el, {
        backgroundColor,
        scale,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: rect.width,
        height: rect.height,
        windowWidth: rect.width,
        windowHeight: rect.height,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        imageTimeout: 15000,
      })
      // Probe taint
      canvas.toDataURL('image/png')
    } catch (second) {
      const msg =
        second instanceof Error
          ? second.message
          : first instanceof Error
            ? first.message
            : String(second)
      if (/unsupported color function|oklch|oklab|color\(/i.test(msg)) {
        throw new Error(
          'Export failed: browser/CSS color not supported by the capture engine. Try reloading the app after updating.',
        )
      }
      if (/taint|security|cross-origin/i.test(msg)) {
        throw new Error(
          'Export blocked by a cross-origin image. Re-import figures as local files.',
        )
      }
      throw new Error(
        msg.includes('Attempting to parse')
          ? `Export capture failed: ${msg}`
          : `Could not capture page: ${msg}`,
      )
    }
  }

  return applyColorMode(canvas, colorMode)
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: 'image/png' | 'image/jpeg',
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode image'))
          return
        }
        resolve(blob)
      },
      mime,
      mime === 'image/jpeg' ? quality : undefined,
    )
  })
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
