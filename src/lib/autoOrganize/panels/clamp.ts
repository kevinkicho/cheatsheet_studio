import type { LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import { steppedLChromeFromMembers } from '../polyomino'
import { rectPerimeterPathD } from '../geometry'

/** Clamp a single run into the content box. */
export function clampRunToBox(
  r: { x: number; y: number; width: number; height: number },
  left: number,
  right: number,
  top?: number,
): { x: number; y: number; width: number; height: number } {
  let rx = r.x
  let ry = r.y
  let rw = r.width
  let rh = r.height
  if (rx < left) {
    rw -= left - rx
    rx = left
  }
  if (rx + rw > right) {
    rw = Math.max(8, right - rx)
  }
  if (top != null && ry < top) {
    rh -= top - ry
    ry = top
  }
  return {
    x: Math.round(rx),
    y: Math.round(ry),
    width: Math.max(8, Math.round(rw)),
    height: Math.max(8, Math.round(rh)),
  }
}

/**
 * Rebuild exterior outline from clamped runs. Never reuse a pre-clamp
 * outlinePath — n-gon rasterization + pad routinely put vertices past the
 * content box (screenshot 235248, outline x=772 > right=768).
 */
export function outlineFromClampedRuns(
  runs: Array<{ x: number; y: number; width: number; height: number }>,
  shape: LayoutPanel['shape'],
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  if (!runs.length) {
    return rectPerimeterPathD(x, y, width, height)
  }
  if (shape !== 'polygon' || runs.length === 1) {
    return rectPerimeterPathD(x, y, width, height)
  }
  // Re-derive stepped perimeter from already-clamped runs (pad=0)
  const chrome = steppedLChromeFromMembers(runs, {
    pad: 0,
    titleBand: 0,
    grid: ORGANIZE_GRID,
  })
  // Final safety: clamp any residual path vertices into the AABB (+1px stroke)
  return clampPathDToRect(
    chrome.outlinePath || rectPerimeterPathD(x, y, width, height),
    x,
    y,
    width,
    height,
  )
}

/** Clamp M/L path coordinates into a rectangle (inclusive right/bottom). */
export function clampPathDToRect(
  d: string,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  if (!d) return d
  const x0 = x
  const y0 = y
  const x1 = x + width
  const y1 = y + height
  // Match pairs: command letter + two numbers, or just numbers in sequence
  return d.replace(
    /(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g,
    (_m, xs: string, ys: string) => {
      let px = Number(xs)
      let py = Number(ys)
      if (!Number.isFinite(px) || !Number.isFinite(py)) return `${xs} ${ys}`
      px = Math.min(x1, Math.max(x0, px))
      py = Math.min(y1, Math.max(y0, py))
      return `${Math.round(px)} ${Math.round(py)}`
    },
  )
}

/** Hard clamp panel chrome into the printable content box (left/right/top). */
export function clampPanelsToContentBox(
  panels: LayoutPanel[],
  box: { left: number; right: number; top?: number },
): LayoutPanel[] {
  const left = box.left
  const right = box.right
  const top = box.top
  if (!(right > left)) return panels
  return panels.map((p) => {
    let x = p.x
    let y = p.y
    let width = p.width
    let height = p.height
    if (x < left) {
      width -= left - x
      x = left
    }
    if (x + width > right) {
      width = Math.max(8, right - x)
    }
    if (top != null && y < top) {
      height -= top - y
      y = top
    }
    x = Math.round(x)
    y = Math.round(y)
    width = Math.max(8, Math.round(width))
    height = Math.max(8, Math.round(height))

    const rawRuns =
      p.runs && p.runs.length > 0
        ? p.runs
        : [{ x: p.x, y: p.y, width: p.width, height: p.height }]
    let runs = rawRuns
      .map((r) => clampRunToBox(r, left, right, top))
      // Also clip runs to the panel AABB so stepped chrome cannot stick out
      .map((r) => {
        const rx0 = Math.max(r.x, x)
        const ry0 = Math.max(r.y, y)
        const rx1 = Math.min(r.x + r.width, x + width)
        const ry1 = Math.min(r.y + r.height, y + height)
        if (rx1 - rx0 < 4 || ry1 - ry0 < 4) {
          return { x, y, width, height }
        }
        return {
          x: Math.round(rx0),
          y: Math.round(ry0),
          width: Math.max(8, Math.round(rx1 - rx0)),
          height: Math.max(8, Math.round(ry1 - ry0)),
        }
      })
    // Drop exact duplicate runs
    const seen = new Set<string>()
    runs = runs.filter((r) => {
      const k = `${r.x},${r.y},${r.width},${r.height}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    if (runs.length === 0) {
      runs = [{ x, y, width, height }]
    }

    const outlinePath = outlineFromClampedRuns(
      runs,
      p.shape,
      x,
      y,
      width,
      height,
    )

    return {
      ...p,
      x,
      y,
      width,
      height,
      runs,
      outlinePath,
    }
  })
}
