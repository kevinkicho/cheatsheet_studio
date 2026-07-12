import { useMemo } from 'react'
import { clampGridOpacity } from '@/types'

type Props = {
  left: number
  top: number
  width: number
  height: number
  spacing: number
  /**
   * Target line alpha 0–0.3 (from store).
   * Applied ONLY via CSS `opacity` on this layer so every extent
   * (board / page / printable) composites identically.
   */
  opacity: number
  /**
   * Board-space phase for pattern alignment (export page crops of a continuous
   * board grid). Lines line up with MainCanvas when phase = page origin.
   */
  phaseX?: number
  phaseY?: number
}

/** Cache pattern data-URLs so board & page tiles share the exact same pixels. */
const patternCache = new Map<string, string>()

/**
 * Build a repeating tile with FULLY OPAQUE line strokes.
 * Strength is controlled exclusively by CSS opacity on the wrapper —
 * never by rgba alpha in the strokes (that looked wildly different for
 * huge board layers vs small page layers under transform:scale).
 */
function getGridPatternUrl(spacing: number): string {
  const step = Math.max(2, Math.round(spacing))
  const major = step * 2
  const key = `s${step}`
  const hit = patternCache.get(key)
  if (hit) return hit

  const dpr = 2
  const css = major
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(2, Math.round(css * dpr))
  canvas.height = Math.max(2, Math.round(css * dpr))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    patternCache.set(key, '')
    return ''
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, css, css)

  // Minor lines — solid color, NO alpha in the stroke
  ctx.strokeStyle = '#64748b' // slate-500, soft on dark boards
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= css; x += step) {
    const xi = Math.floor(x) + 0.5
    ctx.moveTo(xi, 0)
    ctx.lineTo(xi, css)
  }
  for (let y = 0; y <= css; y += step) {
    const yi = Math.floor(y) + 0.5
    ctx.moveTo(0, yi)
    ctx.lineTo(css, yi)
  }
  ctx.stroke()

  // Major every 2 cells — slightly lighter, still fully opaque in the bitmap
  ctx.strokeStyle = '#94a3b8' // slate-400
  ctx.beginPath()
  for (let x = 0; x <= css; x += major) {
    const xi = Math.floor(x) + 0.5
    ctx.moveTo(xi, 0)
    ctx.lineTo(xi, css)
  }
  for (let y = 0; y <= css; y += major) {
    const yi = Math.floor(y) + 0.5
    ctx.moveTo(0, yi)
    ctx.lineTo(css, yi)
  }
  ctx.stroke()

  const url = canvas.toDataURL('image/png')
  patternCache.set(key, url)
  return url
}

/**
 * Identical grid for board / full-page / printable.
 * Only left/top/width/height differ — opacity path is the same CSS property.
 */
export function CanvasGridLayer({
  left,
  top,
  width,
  height,
  spacing,
  opacity,
  phaseX = 0,
  phaseY = 0,
}: Props) {
  const alpha = clampGridOpacity(opacity)
  const step = Math.max(2, Math.round(spacing))
  const major = step * 2

  const patternUrl = useMemo(() => {
    if (typeof document === 'undefined') return ''
    return getGridPatternUrl(step)
  }, [step])

  if (alpha <= 0 || width < 1 || height < 1 || !patternUrl) return null

  // Align repeating tile with board origin (negative phase → same lines as main)
  const posX = major > 0 ? -(((phaseX % major) + major) % major) : 0
  const posY = major > 0 ? -(((phaseY % major) + major) % major) : 0

  return (
    <div
      className="pointer-events-none absolute z-[2]"
      style={{
        left,
        top,
        width,
        height,
        // Strength ONLY here — same for a 3200px board tile and an 816px page
        opacity: alpha,
        backgroundImage: `url(${patternUrl})`,
        backgroundSize: `${major}px ${major}px`,
        backgroundPosition: `${posX}px ${posY}px`,
        backgroundRepeat: 'repeat',
        // Isolate so opacity doesn’t interact with page chrome underneath
        isolation: 'isolate',
      }}
      data-grid-opacity={alpha}
      data-grid-spacing={step}
      aria-hidden
    />
  )
}
