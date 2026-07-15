import type { LayoutPanel } from '@/types'

/** True if every member of child is also a member of parent and child is deeper. */
export function isPanelChildOf(parent: LayoutPanel, child: LayoutPanel): boolean {
  if (!parent.memberIds?.length || !child.memberIds?.length) return false
  if ((child.hierarchyLevel ?? 1) <= (parent.hierarchyLevel ?? 1)) return false
  const set = new Set(parent.memberIds)
  return child.memberIds.every((id) => set.has(id))
}

/** Nested under a stroked outer parent (multi-level L2/L3 under L1). */
export function hasOuterStrokedParent(
  p: LayoutPanel,
  all: LayoutPanel[],
): boolean {
  if ((p.hierarchyLevel ?? 1) <= 1) return false
  if (!p.memberIds?.length) return false
  return all.some(
    (o) =>
      o.id !== p.id &&
      o.showStroke !== false &&
      (o.hierarchyLevel ?? 1) < (p.hierarchyLevel ?? 1) &&
      o.memberIds?.length &&
      p.memberIds!.every((id) => o.memberIds!.includes(id)),
  )
}

/**
 * Exclusive title strip height for chrome (must match buildNestedHierarchyPanels).
 * Nested L2/L3 under multi: 0 — chip paints under L1 header in the UI layer.
 */
export function exclusiveTitleBandPx(
  p: LayoutPanel,
  all: LayoutPanel[],
): number {
  if (p.showTitle === false || p.showStroke === false) return 0
  const level = p.hierarchyLevel ?? 1
  if (level <= 1) return 26
  if (hasOuterStrokedParent(p, all)) return 0
  return 18
}
