import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import { panelRunsOverlap, rectsOverlap, rectPerimeterPathD } from '../geometry'
import { chromeFromMembers } from '../polyomino'

/**
 * Hard panel layout invariants (fast):
 * - cards clear visual panel header chips (incl. nested L2 under L1)
 * - same-level stroked panels do not overlap
 * - same-level frames respect user L1 / L2 panel gaps (stroke-to-stroke)
 *
 * Batches moves and rebuilds once per pass (not per collision).
 *
 * When `scopePanelIds` is set (in-panel auto-layout), title clearance and
 * sibling separation only apply inside that cluster so packing one panel does
 * not cascade-push unrelated panels down the sheet.
 */
export function enforcePanelLayoutInvariants(
  items: CanvasItem[],
  panels: LayoutPanel[],
  opts?: {
    grid?: number
    panelPad?: number
    contentLeft?: number
    contentRight?: number
    contentTop?: number
    /**
     * Fallback min frame gap (legacy). Prefer `l1GapPx` / `l2GapPx`.
     * Used when level-specific gaps are omitted.
     */
    minGapPx?: number
    /** Stroke-to-stroke gap between L1 (outer) sibling panels. */
    l1GapPx?: number
    /** Stroke-to-stroke gap between L2+ sibling panels. */
    l2GapPx?: number
    /**
     * Limit title clearance + internal sibling separation to these panels
     * (edited panel + nested children). External same-level panels are only
     * nudged if they overlap the `rootPanelId` after growth.
     */
    scopePanelIds?: Set<string>
    /** Root of an in-panel edit ΓÇö used for one-shot external sibling push. */
    rootPanelId?: string
  },
): { items: CanvasItem[]; panels: LayoutPanel[] } {
  if (panels.length === 0) return { items, panels }
  const grid = Math.max(4, opts?.grid ?? ORGANIZE_GRID)
  const padBudget = Math.max(0, opts?.panelPad ?? 4)
  const minGapFallback = Math.max(0, opts?.minGapPx ?? 2)
  const l1Gap = Math.max(0, opts?.l1GapPx ?? minGapFallback)
  const l2Gap = Math.max(0, opts?.l2GapPx ?? minGapFallback)
  const gapForLevel = (level: number) => (level <= 1 ? l1Gap : l2Gap)
  const left = opts?.contentLeft
  const right = opts?.contentRight
  const top = opts?.contentTop
  const scope = opts?.scopePanelIds
  const rootId = opts?.rootPanelId
  const inScope = (id: string) => !scope || scope.has(id)

  /**
   * Bottom of the *visible* title chip ΓÇö matches LayoutPanelsLayer.
   * Cards must sit strictly below this Y.
   */
  const visualTitleBottom = (p: LayoutPanel, all: LayoutPanel[]): number => {
    if (p.showTitle === false || p.showStroke === false) return p.y
    // Match LayoutPanelsLayer: chip always on this panel's top edge.
    const level = p.hierarchyLevel ?? 1
    if (level <= 1) return p.y + exclusiveBand(p, all)
    // Nested L2/L3: local chip (~14px tall at y+2)
    return p.y + 2 + 14
  }

  const exclusiveBand = (p: LayoutPanel, all: LayoutPanel[]): number => {
    if (p.showTitle === false || p.showStroke === false) return 0
    if ((p.hierarchyLevel ?? 1) <= 1) {
      const hasNestedStroke = all.some(
        (c) =>
          c.id !== p.id &&
          c.showStroke !== false &&
          (c.hierarchyLevel ?? 1) > 1 &&
          c.memberIds?.length &&
          p.memberIds?.length &&
          c.memberIds.every((id) => p.memberIds!.includes(id)),
      )
      return hasNestedStroke ? 42 : 26
    }
    // Nested L2/L3: local chip strip (even under outer parent)
    return 16
  }

  const isNestedPair = (a: LayoutPanel, b: LayoutPanel) => {
    if (!a.memberIds?.length || !b.memberIds?.length) return false
    const aSet = new Set(a.memberIds)
    const bSet = new Set(b.memberIds)
    return (
      b.memberIds.every((id) => aSet.has(id)) ||
      a.memberIds.every((id) => bSet.has(id))
    )
  }

  /**
   * True siblings under the same outer parent (or both L1 peers).
   * Separating L2s from *different* L1 parents was blowing layouts apart ΓÇö
   * Biology L2s got shoved by Chemistry L2s, leaving huge empty voids.
   */
  const areSiblings = (a: LayoutPanel, b: LayoutPanel, all: LayoutPanel[]) => {
    const la = a.hierarchyLevel ?? 1
    const lb = b.hierarchyLevel ?? 1
    if (la !== lb) return false
    if (la <= 1) return true
    if (!a.memberIds?.length || !b.memberIds?.length) return false
    const parentsOf = (p: LayoutPanel) =>
      all.filter(
        (o) =>
          o.id !== p.id &&
          o.showStroke !== false &&
          (o.hierarchyLevel ?? 1) < (p.hierarchyLevel ?? 1) &&
          o.memberIds?.length &&
          p.memberIds!.every((id) => o.memberIds!.includes(id)),
      )
    const pa = parentsOf(a)
    const pb = parentsOf(b)
    if (pa.length === 0 && pb.length === 0) return true
    return pa.some((p) => pb.some((q) => q.id === p.id))
  }

  const padOf = new Map<string, number>(
    panels.map((p) => [p.id, padBudget]),
  )

  const rebuild = (
    p: LayoutPanel,
    byId: Map<string, CanvasItem>,
    allPanels: LayoutPanel[],
    padUse?: number,
  ): LayoutPanel => {
    const members = (p.memberIds ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => m != null && !m.hidden)
    if (members.length === 0) return p
    const titleBand = exclusiveBand(p, allPanels)
    const useNgon = p.shape === 'polygon'
    // Leaf panels (no nested stroked children): n-gon from card footprints.
    // Parent panels that wrap L2s: solid AABB — stepped union of all cards
    // recreates empty L-notches / snaking outer chrome (screenshot 031425).
    const hasNestedStrokeKids = allPanels.some(
      (c) =>
        c.id !== p.id &&
        c.showStroke !== false &&
        (c.hierarchyLevel ?? 1) > (p.hierarchyLevel ?? 1) &&
        c.memberIds?.length &&
        p.memberIds?.length &&
        c.memberIds.every((id) => p.memberIds!.includes(id)),
    )
    let effPad = Math.max(0, padUse ?? padOf.get(p.id) ?? padBudget)
    const minX = Math.min(...members.map((m) => m.x))
    const maxX = Math.max(...members.map((m) => m.x + m.width))
    if (left != null) {
      effPad = Math.min(effPad, Math.max(0, minX - left))
    }
    if (right != null) {
      effPad = Math.min(effPad, Math.max(0, right - maxX))
    }
    const chrome = chromeFromMembers(members, {
      pad: effPad,
      titleBand,
      shape: useNgon ? 'polygon' : 'rect',
      grid,
      solidMode:
        useNgon && !hasNestedStrokeKids ? 'blocks' : 'solid-aabb',
    })
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
    const runs = (chrome.runs ?? [{ x, y, width, height }]).map((r) => {
      let rx = r.x
      let ry = r.y
      let rw = r.width
      let rh = r.height
      if (left != null && rx < left) {
        rw -= left - rx
        rx = left
      }
      if (right != null && rx + rw > right) rw = Math.max(8, right - rx)
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
    })
    return {
      ...p,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(8, Math.round(width)),
      height: Math.max(8, Math.round(height)),
      runs,
      outlinePath:
        chrome.outlinePath && width >= chrome.width - 1
          ? chrome.outlinePath
          : rectPerimeterPathD(x, y, width, height),
      shape: useNgon ? 'polygon' : p.shape,
    }
  }

  const rebuildAll = (nextItems: CanvasItem[], nextPanels: LayoutPanel[]) => {
    const byId = new Map(nextItems.map((i) => [i.id, i]))
    return nextPanels.map((p) =>
      rebuild(p, byId, nextPanels, padOf.get(p.id)),
    )
  }

  let nextItems = items.map((i) => ({ ...i }))
  let nextPanels = rebuildAll(nextItems, panels.map((p) => ({ ...p })))

  // ΓöÇΓöÇ A: cards clear visual title chips (batch per pass) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  for (let pass = 0; pass < 3; pass++) {
    nextPanels = rebuildAll(nextItems, nextPanels)
    const byId = new Map(nextItems.map((i) => [i.id, i]))
    const dyById = new Map<string, number>()
    for (const p of nextPanels) {
      if (p.showStroke === false) continue
      if (!inScope(p.id)) continue
      const titleBot = visualTitleBottom(p, nextPanels)
      for (const id of p.memberIds ?? []) {
        const c = byId.get(id)
        if (!c || c.hidden) continue
        if (c.y < titleBot - 0.5) {
          const dy = Math.ceil((titleBot - c.y) / grid) * grid
          if (dy > 0) {
            dyById.set(id, Math.max(dyById.get(id) ?? 0, dy))
          }
        }
      }
    }
    if (dyById.size === 0) break
    nextItems = nextItems.map((it) => {
      const dy = dyById.get(it.id)
      return dy ? { ...it, y: Math.round(it.y + dy) } : it
    })
  }

  // ΓöÇΓöÇ B: sibling non-overlap + user frame gaps ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  // Enforce stroke-to-stroke min gap (L1/L2 knobs). Previous logic only
  // separated true overlaps and treated minGap as rectsOverlap eps (which
  // does NOT push frames that are merely closer than the user gap).
  // Scoped mode: only pairs both in the edited cluster (Γëñ3 passes).
  // Unscoped: full sheet (Γëñ6 passes).
  const maxSibPasses = scope ? 3 : 6
  for (let pass = 0; pass < maxSibPasses; pass++) {
    nextPanels = rebuildAll(nextItems, nextPanels)
    const byIdPanel = new Map(nextPanels.map((p) => [p.id, p]))
    let any = false
    const dyCluster = new Map<string, number>() // panelId ΓåÆ dy
    const dxCluster = new Map<string, number>() // panelId ΓåÆ dx

    const levels = [
      ...new Set(nextPanels.map((p) => p.hierarchyLevel ?? 1)),
    ].sort((a, b) => a - b)

    for (const level of levels) {
      const needGap = gapForLevel(level)
      const list = nextPanels
        .filter(
          (p) =>
            (p.hierarchyLevel ?? 1) === level && p.showStroke !== false,
        )
        .sort(
          (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
        )
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = byIdPanel.get(list[i]!.id) ?? list[i]!
          const b = byIdPanel.get(list[j]!.id) ?? list[j]!
          if (isNestedPair(a, b)) continue
          // Scoped: only resolve collisions inside the edited cluster
          if (scope && !(inScope(a.id) && inScope(b.id))) continue

          const yOverlap =
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
          const xOverlap =
            Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
          const runsHit = panelRunsOverlap(a, b, 0)
          const boxHit = rectsOverlap(a, b, 0)
          const siblings = areSiblings(a, b, nextPanels)
          // Cross-parent L2s: only separate true paint overlaps (gap=0).
          // Never apply L2 gap between Biology vs Chemistry children.
          if (!siblings && !(runsHit || boxHit)) continue
          const gap = siblings ? needGap : 0

          const xGap = Math.max(
            0,
            Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)),
          )
          const yGap = Math.max(
            0,
            Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)),
          )
          const shareX = xOverlap > 1
          const shareY = yOverlap > 1
          const tooCloseV = siblings && shareX && yGap < gap
          const tooCloseH = siblings && shareY && xGap < gap
          if (!(runsHit || boxHit || tooCloseV || tooCloseH)) continue

          const padA = padOf.get(a.id) ?? padBudget
          const padB = padOf.get(b.id) ?? padBudget

          // Pixel-exact push (do NOT snap to grid ΓÇö that turned 2px gaps into 24px).
          // Vertical stack / vertical collision: push lower panel down
          if (shareX || (runsHit && yOverlap >= xOverlap) || tooCloseV) {
            const top = a.y <= b.y ? a : b
            const bot = a.y <= b.y ? b : a
            const needY = top.y + top.height + gap - bot.y
            if (needY > 0.5 && bot.memberIds?.length) {
              const dy = Math.ceil(needY)
              dyCluster.set(bot.id, Math.max(dyCluster.get(bot.id) ?? 0, dy))
              any = true
              continue
            }
          }

          // Side-by-side: push rightward panel right (honor L1/L2 gap)
          if (shareY || tooCloseH) {
            const leftP = a.x <= b.x ? a : b
            const rightP = a.x <= b.x ? b : a
            const needX = leftP.x + leftP.width + gap - rightP.x
            if (needX > 0.5 && rightP.memberIds?.length) {
              let dx = Math.ceil(needX)
              if (right != null) {
                const maxDx = Math.max(
                  0,
                  right - (rightP.x + rightP.width),
                )
                dx = Math.min(dx, Math.max(0, Math.floor(maxDx)))
              }
              if (dx > 0.5) {
                dxCluster.set(
                  rightP.id,
                  Math.max(dxCluster.get(rightP.id) ?? 0, dx),
                )
                any = true
                continue
              }
              // Can't move right (at content edge) ΓåÆ fall back to vertical push
              const top = a.y <= b.y ? a : b
              const bot = a.y <= b.y ? b : a
              const needY = top.y + top.height + gap - bot.y
              if (needY > 0.5 && bot.memberIds?.length) {
                const dy = Math.ceil(needY)
                dyCluster.set(bot.id, Math.max(dyCluster.get(bot.id) ?? 0, dy))
                any = true
                continue
              }
            }
          }

          // Thin side-pad collision only: trim pad but never below 2px
          if (
            xOverlap > 0 &&
            yOverlap > 0 &&
            xOverlap <= padA + padB + gap + 2 &&
            (padA > 2 || padB > 2)
          ) {
            padOf.set(a.id, Math.max(2, padA - 2))
            padOf.set(b.id, Math.max(2, padB - 2))
            any = true
          }
        }
      }
    }

    if (dyCluster.size === 0 && dxCluster.size === 0 && !any) break
    if (dyCluster.size > 0 || dxCluster.size > 0) {
      const idDy = new Map<string, number>()
      const idDx = new Map<string, number>()
      for (const [pid, dy] of dyCluster) {
        const p = byIdPanel.get(pid)
        if (!p?.memberIds) continue
        for (const id of p.memberIds) {
          idDy.set(id, Math.max(idDy.get(id) ?? 0, dy))
        }
      }
      for (const [pid, dx] of dxCluster) {
        const p = byIdPanel.get(pid)
        if (!p?.memberIds) continue
        for (const id of p.memberIds) {
          idDx.set(id, Math.max(idDx.get(id) ?? 0, dx))
        }
      }
      nextItems = nextItems.map((it) => {
        const dy = idDy.get(it.id) ?? 0
        const dx = idDx.get(it.id) ?? 0
        if (!dy && !dx) return it
        return {
          ...it,
          x: Math.round(it.x + dx),
          y: Math.round(it.y + dy),
        }
      })
    }
    if (!any) break
  }

  // ΓöÇΓöÇ C: one-shot external push (in-panel only) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  // If the edited root grew into a panel *outside* the scope, nudge that
  // panel's members down once ΓÇö no multi-pass cascade on the whole sheet.
  if (scope && rootId) {
    nextPanels = rebuildAll(nextItems, nextPanels)
    const root = nextPanels.find((p) => p.id === rootId)
    if (root && root.showStroke !== false) {
      const idDy = new Map<string, number>()
      const rootLevel = root.hierarchyLevel ?? 1
      const needGap = gapForLevel(rootLevel)
      for (const other of nextPanels) {
        if (other.id === rootId) continue
        if (other.showStroke === false) continue
        if ((other.hierarchyLevel ?? 1) !== rootLevel) continue
        if (inScope(other.id)) continue
        if (isNestedPair(root, other)) continue
        const xOverlap =
          Math.min(root.x + root.width, other.x + other.width) -
          Math.max(root.x, other.x)
        const yGap = Math.max(0, other.y - (root.y + root.height))
        const hits =
          panelRunsOverlap(root, other, 0) ||
          rectsOverlap(root, other, 0) ||
          (xOverlap > 1 && yGap < needGap)
        if (!hits) continue
        // Only push panels that start at/below the root (below-neighbors)
        if (other.y + other.height / 2 < root.y + root.height / 2) continue
        const needY = root.y + root.height + needGap - other.y
        if (needY <= 0.5 || !other.memberIds?.length) continue
        // Pixel-exact (match sibling pass)
        const dy = Math.ceil(needY)
        for (const id of other.memberIds) {
          idDy.set(id, Math.max(idDy.get(id) ?? 0, dy))
        }
      }
      if (idDy.size > 0) {
        nextItems = nextItems.map((it) => {
          const dy = idDy.get(it.id)
          return dy ? { ...it, y: Math.round(it.y + dy) } : it
        })
        // Rebuild only external panels that moved + root tree
        nextPanels = rebuildAll(nextItems, nextPanels)
      }
    }
  }

  nextPanels = rebuildAll(nextItems, nextPanels)
  return { items: nextItems, panels: nextPanels }
}
