import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from '../constants'
import { panelRunsOverlap, rectsOverlap, rectPerimeterPathD } from '../geometry'
import { chromeFromMembers } from '../polyomino'

/**
 * Rebuild chrome for same-level sibling panels that still overlap after pack
 * (residual pad collisions). Nested parent/child pairs are ignored.
 */
export function resolveSameLevelPanelCollisions(
  panels: LayoutPanel[],
  opts: {
    grid?: number
    panelPad?: number
    placed?: CanvasItem[]
    contentLeft?: number
    contentRight?: number
    multiLevel?: boolean
    outerLevel?: PanelGroupLevel
  },
): LayoutPanel[] {
  if (panels.length <= 1) return panels
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const padBudget = Math.max(0, opts.panelPad ?? 8)
  const byId = new Map((opts.placed ?? []).map((p) => [p.id, p]))
  const multi = opts.multiLevel === true
  const outerLevel = opts.outerLevel ?? 1
  const L1_CHIP = 22
  const L2_CHIP = 16
  let next = panels.slice()
  const padOf = new Map<string, number>(
    panels.map((p) => [p.id, padBudget]),
  )

  const isNested = (a: LayoutPanel, b: LayoutPanel) => {
    if (!a.memberIds?.length || !b.memberIds?.length) return false
    const aSet = new Set(a.memberIds)
    const bSet = new Set(b.memberIds)
    const aHasB = b.memberIds.every((id) => aSet.has(id))
    const bHasA = a.memberIds.every((id) => bSet.has(id))
    return aHasB || bHasA
  }

  const titleBandFor = (p: LayoutPanel): number => {
    if (p.showTitle === false) return 0
    const level = p.hierarchyLevel ?? 1
    if (multi && level === outerLevel) {
      // Room for L1 chip + top-row nested L2 chip (~42)
      return L1_CHIP + 4 + L2_CHIP
    }
    if (multi && level > outerLevel) return L2_CHIP
    return 16
  }

  const rebuild = (p: LayoutPanel, pad: number): LayoutPanel => {
    const members = (p.memberIds ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => m != null && !m.hidden)
    if (members.length === 0) return p
    const titleBand = titleBandFor(p)
    const useNgon = p.shape === 'polygon'
    // Outer multi-level: solid AABB (not stepped from all nested cards)
    const isOuterMulti =
      multi && (p.hierarchyLevel ?? 1) === outerLevel
    const minX = Math.min(...members.map((m) => m.x))
    const maxX = Math.max(...members.map((m) => m.x + m.width))
    let effPad = Math.max(0, pad)
    if (opts.contentLeft != null) {
      effPad = Math.min(effPad, Math.max(0, minX - opts.contentLeft))
    }
    if (opts.contentRight != null) {
      effPad = Math.min(effPad, Math.max(0, opts.contentRight - maxX))
    }
    const chrome = chromeFromMembers(members, {
      pad: effPad,
      titleBand,
      shape: useNgon ? 'polygon' : 'rect',
      grid,
      solidMode: useNgon && !isOuterMulti ? 'blocks' : 'solid-aabb',
    })
    let { x, y, width, height } = chrome
    if (opts.contentLeft != null && x < opts.contentLeft) {
      width -= opts.contentLeft - x
      x = opts.contentLeft
    }
    if (opts.contentRight != null && x + width > opts.contentRight) {
      width = Math.max(8, opts.contentRight - x)
    }
    const runs = (chrome.runs ?? [{ x, y, width, height }]).map((r) => {
      let rx = r.x
      let rw = r.width
      if (opts.contentLeft != null && rx < opts.contentLeft) {
        rw -= opts.contentLeft - rx
        rx = opts.contentLeft
      }
      if (opts.contentRight != null && rx + rw > opts.contentRight) {
        rw = Math.max(8, opts.contentRight - rx)
      }
      return {
        x: Math.round(rx),
        y: Math.round(r.y),
        width: Math.max(8, Math.round(rw)),
        height: Math.max(8, Math.round(r.height)),
      }
    })
    const outline =
      chrome.outlinePath && width >= chrome.width - 1
        ? chrome.outlinePath
        : rectPerimeterPathD(x, y, width, height)
    return {
      ...p,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(8, Math.round(width)),
      height: Math.max(8, Math.round(height)),
      runs,
      outlinePath: outline,
      shape: useNgon ? 'polygon' : 'rect',
    }
  }

  for (let pass = 0; pass < 4; pass++) {
    let changed = false
    for (let i = 0; i < next.length; i++) {
      for (let j = i + 1; j < next.length; j++) {
        const a = next[i]!
        const b = next[j]!
        if ((a.hierarchyLevel ?? 1) !== (b.hierarchyLevel ?? 1)) continue
        if (a.showStroke === false || b.showStroke === false) continue
        if (isNested(a, b)) continue
        if (!(panelRunsOverlap(a, b, 0) || rectsOverlap(a, b, 0))) continue

        const pa = Math.max(0, (padOf.get(a.id) ?? padBudget) - 2)
        const pb = Math.max(0, (padOf.get(b.id) ?? padBudget) - 2)
        padOf.set(a.id, pa)
        padOf.set(b.id, pb)
        next[i] = rebuild(a, pa)
        next[j] = rebuild(b, pb)
        changed = true
      }
    }
    if (!changed) break
  }
  return next
}
