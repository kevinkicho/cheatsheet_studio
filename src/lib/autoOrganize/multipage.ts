import type { CanvasItem } from '@/types'
import { ORGANIZE_GRID } from './constants'

export function resolveMultipageStraddles(
  items: CanvasItem[],
  opts: {
    pageHeight: number
    marginTop: number
    contentHeight: number
    grid?: number
    mode?: 'continuous' | 'board'
  },
): CanvasItem[] {
  if (items.length === 0) return items
  const pageH = Math.max(1, opts.pageHeight)
  const mTop = Math.max(0, opts.marginTop)
  const contentH = Math.max(1, opts.contentHeight)
  const grid = Math.max(1, opts.grid ?? ORGANIZE_GRID)
  const continuous = opts.mode === 'continuous'
  // Continuous: virtual page step = contentH. Board: real pageHeight.
  const step = continuous ? contentH : pageH

  const rows = items.map((it) => ({ ...it }))
  let guard = 0
  while (guard++ < 120) {
    let moved = false
    const order = [...rows]
      .filter((r) => !r.hidden)
      .sort((a, b) => a.y - b.y || a.x - b.x)

    for (const it of order) {
      const y = it.y
      const h = Math.max(1, it.height)
      const bot = y + h
      const k = Math.max(
        0,
        continuous
          ? Math.floor((y - mTop) / step)
          : Math.floor(y / step),
      )
      const bandStart = continuous ? mTop + k * step : k * step + mTop
      const bandEnd = bandStart + contentH

      if (y + 0.5 < bandStart) {
        const dy = Math.ceil((bandStart - y) / grid) * grid
        if (dy > 0) {
          for (const r of rows) {
            if (!r.hidden && r.y + 0.5 >= y) r.y = Math.round(r.y + dy)
          }
          moved = true
          break
        }
      }

      if (bot > bandEnd + 0.5) {
        if (h > contentH + 0.5) continue
        const nextStart = continuous
          ? bandStart + step
          : (k + 1) * step + mTop
        const dy = Math.ceil((nextStart - y) / grid) * grid
        if (dy > 0) {
          for (const r of rows) {
            if (!r.hidden && r.y + 0.5 >= y) r.y = Math.round(r.y + dy)
          }
          moved = true
          break
        }
      }

      if (y + 0.5 >= bandEnd) {
        const nextStart = continuous
          ? bandStart + step
          : (k + 1) * step + mTop
        const dy = Math.ceil((nextStart - y) / grid) * grid
        if (dy > 0) {
          for (const r of rows) {
            if (!r.hidden && r.y + 0.5 >= y) r.y = Math.round(r.y + dy)
          }
          moved = true
          break
        }
      }
    }
    if (!moved) break
  }
  return rows
}

/**
 * Map continuous content-flow Y (no gutters) onto the real multipage board
 * (pages of `pageHeight` with content bands of `contentHeight` + margins).
 *
 * continuous: y = marginTop + offset
 * board:      y = pageIndex * pageHeight + marginTop + (offset % contentHeight)
 */
export function insertPageGutters(
  items: CanvasItem[],
  opts: {
    pageHeight: number
    marginTop: number
    contentHeight: number
  },
): CanvasItem[] {
  if (items.length === 0) return items
  const pH = Math.max(1, opts.pageHeight)
  const mTop = Math.max(0, opts.marginTop)
  const cH = Math.max(1, opts.contentHeight)
  if (pH <= cH + 0.5) {
    return items
  }
  return items.map((it) => {
    if (it.hidden) return it
    const offset = it.y - mTop
    if (offset < -0.5) return it
    const page = Math.max(0, Math.floor(offset / cH))
    const within = offset - page * cH
    return {
      ...it,
      y: Math.round(page * pH + mTop + within),
    }
  })
}
