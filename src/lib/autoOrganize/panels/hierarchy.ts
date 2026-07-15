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

/** Nested L2/L3 local chip strip (matches LayoutPanelsLayer chip at y+2 + ~14). */
export const NESTED_TITLE_BAND_PX = 16
/** L1 chip only. */
export const L1_TITLE_BAND_PX = 26
/** L1 + room so top-row nested L2 chip sits under L1 chip, not on it. */
export const L1_NESTED_TITLE_BAND_PX = 42

/**
 * Exclusive title strip height for chrome (must match buildNestedHierarchyPanels).
 *
 * Each stroked panel owns its own chip band above its cards:
 *   L1 multi with nested L2 stroke → ~42
 *   L1 alone → ~26
 *   Nested L2/L3 → ~16 (local chip — never stack all under L1; 014705)
 */
export function exclusiveTitleBandPx(
  p: LayoutPanel,
  all: LayoutPanel[],
): number {
  if (p.showTitle === false || p.showStroke === false) return 0
  const level = p.hierarchyLevel ?? 1
  if (level <= 1) {
    const hasNestedStroke = all.some(
      (c) =>
        c.id !== p.id &&
        c.showStroke !== false &&
        (c.hierarchyLevel ?? 1) > 1 &&
        c.memberIds?.length &&
        p.memberIds?.length &&
        c.memberIds.every((id) => p.memberIds!.includes(id)),
    )
    return hasNestedStroke ? L1_NESTED_TITLE_BAND_PX : L1_TITLE_BAND_PX
  }
  return NESTED_TITLE_BAND_PX
}
