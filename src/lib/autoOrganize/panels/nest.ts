import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import { chromeFromMembers } from '../polyomino'
import { rectPerimeterPathD } from '../geometry'
import { isPanelChildOf } from './hierarchy'
import { outlineFromClampedRuns } from './clamp'

/**
 * Nest containment without cutting into cards.
 *
 * CRITICAL: never shrink a child panel below its member-card envelope.
 * Shrinking L2 for a “nest gutter” left cards sticking past panel borders
 * (rect mode overflow). We only:
 *  1) Expand each panel so it covers its members + pad
 *  2) Expand outer stepped/solid parents so they cover children + inset
 */
export function nestContainPanels(
  panels: LayoutPanel[],
  opts?: {
    insetPx?: number
    contentLeft?: number
    contentRight?: number
    /** Printable top — never grow title chrome into the top margin. */
    contentTop?: number
    /** Card geometry after pack — required so we never cut under members. */
    placed?: CanvasItem[]
    panelPad?: number
  },
): LayoutPanel[] {
  if (panels.length <= 1) return panels
  const inset = Math.max(2, opts?.insetPx ?? 4)
  const pad = Math.max(0, opts?.panelPad ?? 4)
  const left = opts?.contentLeft
  const right = opts?.contentRight
  const top = opts?.contentTop
  const byId = new Map((opts?.placed ?? []).map((c) => [c.id, c]))
  let next = panels.map((p) => ({ ...p }))

  const memberEnvelope = (p: LayoutPanel) => {
    const mem = (p.memberIds ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => Boolean(m) && !m.hidden)
    if (mem.length === 0) return null
    const minX = Math.min(...mem.map((m) => m.x))
    const minY = Math.min(...mem.map((m) => m.y))
    const maxX = Math.max(...mem.map((m) => m.x + m.width))
    const maxY = Math.max(...mem.map((m) => m.y + m.height))
    return { minX, minY, maxX, maxY }
  }

  // 1) Snap every panel to members + pad + title (expand AND shrink).
  // Expand-only left oversized empty corners (screenshots 223714 / 223755).
  for (let i = 0; i < next.length; i++) {
    const p = next[i]!
    const env = memberEnvelope(p)
    if (!env) continue
    const mem = (p.memberIds ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => Boolean(m) && !m.hidden)
    // Match buildNestedHierarchyPanels: nested L2 under multi has no exclusive band
    const titleExtra =
      p.showTitle === false
        ? 0
        : (p.hierarchyLevel ?? 1) <= 1
          ? 26
          : (() => {
              const hasOuter = next.some(
                (o) =>
                  o.id !== p.id &&
                  o.showStroke !== false &&
                  (o.hierarchyLevel ?? 1) < (p.hierarchyLevel ?? 1) &&
                  o.memberIds?.length &&
                  p.memberIds?.every((id) => o.memberIds!.includes(id)),
              )
              return hasOuter ? 0 : 18
            })()

    const clampBox = (
      x0: number,
      y0: number,
      w0: number,
      h0: number,
    ) => {
      let x = x0
      let y = y0
      let w = w0
      let h = h0
      if (left != null && x < left) {
        w -= left - x
        x = left
      }
      if (right != null && x + w > right) {
        w = Math.max(8, right - x)
      }
      if (top != null && y < top) {
        h -= top - y
        y = top
      }
      // Never cut under members
      if (x > env.minX) {
        w += x - env.minX
        x = env.minX
      }
      if (y > env.minY) {
        h += y - env.minY
        y = env.minY
      }
      if (x + w < env.maxX) w = env.maxX - x
      if (y + h < env.maxY) h = env.maxY - y
      if (right != null && x + w > right) w = Math.max(8, right - x)
      return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(8, Math.round(w)),
        height: Math.max(8, Math.round(h)),
      }
    }

    if (p.shape === 'polygon' && mem.length > 0) {
      const chrome = chromeFromMembers(mem, {
        pad,
        titleBand: titleExtra,
        shape: 'polygon',
        grid: ORGANIZE_GRID,
        solidMode: 'blocks',
      })
      const box = clampBox(chrome.x, chrome.y, chrome.width, chrome.height)
      const runs = (chrome.runs ?? [box]).map((r) =>
        clampBox(r.x, r.y, r.width, r.height),
      )
      next[i] = {
        ...p,
        ...box,
        runs,
        outlinePath:
          chrome.outlinePath &&
          box.x === Math.round(chrome.x) &&
          box.y === Math.round(chrome.y) &&
          box.width === Math.round(chrome.width)
            ? chrome.outlinePath
            : rectPerimeterPathD(box.x, box.y, box.width, box.height),
      }
      continue
    }

    const tight = clampBox(
      env.minX - pad,
      env.minY - pad - titleExtra,
      env.maxX - env.minX + pad * 2,
      env.maxY - env.minY + pad * 2 + titleExtra,
    )
    next[i] = {
      ...p,
      ...tight,
      runs: [tight],
      outlinePath: rectPerimeterPathD(
        tight.x,
        tight.y,
        tight.width,
        tight.height,
      ),
    }
  }

  // 2) Expand outer parents to cover children + nest inset (children stay put).
  // Cap growth so we never invade a same-level sibling panel (L1 eating L1).
  for (let i = 0; i < next.length; i++) {
    const parent = next[i]!
    if (parent.showStroke === false) continue
    const children = next.filter((c) => isPanelChildOf(parent, c))
    if (children.length === 0) continue
    let minX = parent.x
    let minY = parent.y
    let maxX = parent.x + parent.width
    let maxY = parent.y + parent.height
    let need = false
    for (const c of children) {
      if (
        c.x < parent.x + inset ||
        c.y < parent.y + inset ||
        c.x + c.width > parent.x + parent.width - inset ||
        c.y + c.height > parent.y + parent.height - inset
      ) {
        need = true
        minX = Math.min(minX, c.x - inset)
        minY = Math.min(minY, c.y - inset)
        maxX = Math.max(maxX, c.x + c.width + inset)
        maxY = Math.max(maxY, c.y + c.height + inset)
      }
    }
    if (!need) continue
    if (left != null) minX = Math.max(left, minX)
    if (right != null) maxX = Math.min(right, maxX)
    if (top != null) minY = Math.max(top, minY)
    for (const sib of next) {
      if (sib.id === parent.id) continue
      if ((sib.hierarchyLevel ?? 1) !== (parent.hierarchyLevel ?? 1)) continue
      if (sib.showStroke === false) continue
      // Don't grow into sibling AABBs
      if (sib.x >= parent.x + parent.width - 2 && maxX > sib.x - 2) {
        maxX = Math.min(maxX, sib.x - 2)
      }
      if (sib.y >= parent.y + parent.height - 2 && maxY > sib.y - 2) {
        maxY = Math.min(maxY, sib.y - 2)
      }
      if (sib.x + sib.width <= parent.x + 2 && minX < sib.x + sib.width + 2) {
        minX = Math.max(minX, sib.x + sib.width + 2)
      }
      if (sib.y + sib.height <= parent.y + 2 && minY < sib.y + sib.height + 2) {
        minY = Math.max(minY, sib.y + sib.height + 2)
      }
    }
    if (maxX <= minX + 8 || maxY <= minY + 8) continue
    const x = Math.round(minX)
    const y = Math.round(minY)
    const width = Math.max(8, Math.round(maxX - x))
    const height = Math.max(8, Math.round(maxY - y))
    if ((parent.runs?.length ?? 0) > 1 || parent.shape === 'polygon') {
      next[i] = { ...parent, x, y, width, height }
    } else {
      next[i] = {
        ...parent,
        x,
        y,
        width,
        height,
        runs: [{ x, y, width, height }],
        outlinePath: rectPerimeterPathD(x, y, width, height),
      }
    }
  }

  return next
}

/**
 * Rebuild multi-child outer panels from final child panel AABBs.
 * Call after nest/collision so L1 always hugs free-flow L2s (no empty AABB).
 */
export function rebuildMultiChildOuters(
  panels: LayoutPanel[],
  opts?: {
    panelPad?: number
    titleBandPx?: number
    contentLeft?: number
    contentRight?: number
    contentTop?: number
    grid?: number
  },
): LayoutPanel[] {
  if (panels.length <= 1) return panels
  const pad = Math.max(0, opts?.panelPad ?? 4)
  const grid = Math.max(4, opts?.grid ?? ORGANIZE_GRID)
  const left = opts?.contentLeft
  const right = opts?.contentRight
  const top = opts?.contentTop
  const next = panels.map((p) => ({ ...p }))

  for (let i = 0; i < next.length; i++) {
    const parent = next[i]!
    if (parent.showStroke === false) continue
    const children = next.filter(
      (c) =>
        c.showStroke !== false &&
        isPanelChildOf(parent, c) &&
        (c.hierarchyLevel ?? 1) === (parent.hierarchyLevel ?? 1) + 1,
    )
    // Also accept any deeper nested children if no direct level+1
    const kids =
      children.length >= 2
        ? children
        : next.filter((c) => c.showStroke !== false && isPanelChildOf(parent, c))
    if (kids.length < 2) continue

    const blocks = kids.map((c) => ({
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
    }))
    const titleBand =
      (parent.hierarchyLevel ?? 1) <= 1
        ? Math.max(22, opts?.titleBandPx ?? 16) + 4
        : Math.max(16, opts?.titleBandPx ?? 16)
    // Synthetic members = child frames; pad 0 (children already include pad)
    const chrome = chromeFromMembers(
      blocks.map((b) => ({
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
      })),
      {
        pad: 0,
        titleBand,
        shape: 'polygon',
        grid,
        solidMode: 'blocks',
        blocks,
      },
    )
    let { x, y, width, height } = chrome
    if (left != null && x < left) {
      width -= left - x
      x = left
    }
    if (right != null && x + width > right) {
      width = Math.max(8, right - x)
    }
    if (top != null && y < top) {
      height -= top - y
      y = top
    }
    next[i] = {
      ...parent,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(8, Math.round(width)),
      height: Math.max(8, Math.round(height)),
      runs: (chrome.runs ?? [{ x, y, width, height }]).map((r) => ({
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.max(8, Math.round(r.width)),
        height: Math.max(8, Math.round(r.height)),
      })),
      shape: 'polygon',
      outlinePath:
        chrome.outlinePath || rectPerimeterPathD(x, y, width, height),
    }
  }
  return next
}

/**
 * Clip every child panel's runs/AABB into its stroked parent so n-gon L2/L3
 * never paints outside L1 (screenshot 235248).
 */
export function clipNestedPanelRunsToParents(
  panels: LayoutPanel[],
): LayoutPanel[] {
  if (panels.length <= 1) return panels
  const next = panels.map((p) => ({ ...p }))
  for (let i = 0; i < next.length; i++) {
    const child = next[i]!
    if (child.showStroke === false) continue
    const parents = next.filter(
      (p) =>
        p.showStroke !== false &&
        (p.hierarchyLevel ?? 1) < (child.hierarchyLevel ?? 1) &&
        isPanelChildOf(p, child),
    )
    if (parents.length === 0) continue
    // Tightest parent (deepest)
    const parent = parents.sort(
      (a, b) => (b.hierarchyLevel ?? 1) - (a.hierarchyLevel ?? 1),
    )[0]!
    const inset = 1
    const pl = parent.x + inset
    const pt = parent.y + inset
    const pr = parent.x + parent.width - inset
    const pb = parent.y + parent.height - inset
    if (!(pr > pl && pb > pt)) continue

    let x = child.x
    let y = child.y
    let width = child.width
    let height = child.height
    if (x < pl) {
      width -= pl - x
      x = pl
    }
    if (y < pt) {
      height -= pt - y
      y = pt
    }
    if (x + width > pr) width = Math.max(8, pr - x)
    if (y + height > pb) height = Math.max(8, pb - y)
    x = Math.round(x)
    y = Math.round(y)
    width = Math.max(8, Math.round(width))
    height = Math.max(8, Math.round(height))

    const runs = (
      child.runs?.length
        ? child.runs
        : [{ x: child.x, y: child.y, width: child.width, height: child.height }]
    )
      .map((r) => {
        const rx0 = Math.max(r.x, x, pl)
        const ry0 = Math.max(r.y, y, pt)
        const rx1 = Math.min(r.x + r.width, x + width, pr)
        const ry1 = Math.min(r.y + r.height, y + height, pb)
        if (rx1 - rx0 < 4 || ry1 - ry0 < 4) return null
        return {
          x: Math.round(rx0),
          y: Math.round(ry0),
          width: Math.max(8, Math.round(rx1 - rx0)),
          height: Math.max(8, Math.round(ry1 - ry0)),
        }
      })
      .filter(Boolean) as Array<{
      x: number
      y: number
      width: number
      height: number
    }>

    const finalRuns =
      runs.length > 0 ? runs : [{ x, y, width, height }]
    next[i] = {
      ...child,
      x,
      y,
      width,
      height,
      runs: finalRuns,
      outlinePath: outlineFromClampedRuns(
        finalRuns,
        child.shape,
        x,
        y,
        width,
        height,
      ),
    }
  }
  return next
}
