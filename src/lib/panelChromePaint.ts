/**
 * Layout panel chrome paint policy (canvas + export).
 *
 * Root causes of “muddy stacked colors” on n-gon auto-layout:
 *
 * 1. **Nested tint stack** — L1 and L2 both painted semi-transparent fills.
 *    Child sits on top of parent → alphas composite into a third muddy hue.
 *    Policy: soft-fill **leaf** chrome only (no nested stroked frames inside).
 *    Outer frames keep stroke + title chip only.
 *
 * 2. **Per-run translucent double-paint** — n-gon fill was one translucent
 *    div per horizontal run. Runs often overlap after enclosure/merge; each
 *    overlap painted alpha again → dark blotches inside one panel.
 *    Policy: paint runs with **opaque** accent color under a single parent
 *    `opacity` so the group flattens first, then fades once (CSS stacking).
 *
 * 3. **outlinePath is stroke-only** — polyomino exterior is edge segments
 *    (`M…L…` per edge), not a closed fillable region. Soft fill cannot use
 *    path fill; it must use runs (or a future closed fill path).
 */
import type { LayoutPanel } from '@/types'

/** Deeper stroked panel wholly contained (by member set) in `panel`. */
export function hasNestedStrokedChild(
  panel: LayoutPanel,
  all: LayoutPanel[],
): boolean {
  const members = panel.memberIds
  if (!members?.length) return false
  const level = panel.hierarchyLevel ?? 1
  const set = new Set(members)
  return all.some((c) => {
    if (c.id === panel.id) return false
    if (c.showStroke === false) return false
    if ((c.hierarchyLevel ?? 1) <= level) return false
    const kids = c.memberIds
    if (!kids?.length) return false
    return kids.every((id) => set.has(id))
  })
}

/**
 * Soft wash fill only when this panel is a leaf of the stroked hierarchy.
 * Parents that wrap stroked children get stroke/title only (no fill).
 */
export function panelWantsSoftFill(
  panel: LayoutPanel,
  all: LayoutPanel[],
): boolean {
  // Title-only chrome never washes
  if (panel.showStroke === false) return false
  return !hasNestedStrokedChild(panel, all)
}

/** Target soft-fill opacity (applied once on a group, not per-run). */
export function panelFillOpacity(
  level: number,
  shape: LayoutPanel['shape'] | undefined,
): number {
  const isPoly = shape === 'polygon'
  if (level <= 1) return isPoly ? 0.055 : 0.06
  return isPoly ? 0.07 : 0.075
}

/**
 * Parse accent to opaque `rgb(r,g,b)` / `rgba(...,1)` for use under a parent
 * opacity group. Falls back to indigo if unparseable.
 */
export function accentToSolidColor(accent: string | undefined): string {
  const a = (accent ?? 'rgba(99, 102, 241, 0.55)').trim()
  const rgba = a.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i,
  )
  if (rgba) {
    return `rgb(${Math.round(Number(rgba[1]))}, ${Math.round(Number(rgba[2]))}, ${Math.round(Number(rgba[3]))})`
  }
  // hex #rgb / #rrggbb
  const hex = a.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let h = hex[1]!
    if (h.length === 3) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('')
    }
    const n = parseInt(h, 16)
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
  }
  // Named / other CSS — leave as-is; parent opacity still applies once
  return a
}

/**
 * Pairwise overlap area of runs (for diagnostics / tests).
 * Overlap area > 0 means translucent-per-run paint would double-composite.
 */
export function runOverlapArea(
  runs: Array<{ x: number; y: number; width: number; height: number }>,
): number {
  let area = 0
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i]!
      const b = runs[j]!
      const xOl =
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const yOl =
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (xOl > 0 && yOl > 0) area += xOl * yOl
    }
  }
  return area
}

/**
 * Legacy helper: translucent accent string (stroke / chip). Prefer
 * accentToSolidColor + group opacity for soft fills.
 */
export function accentWithAlpha(
  accent: string | undefined,
  alpha: number,
): string {
  const a = accent ?? 'rgba(99, 102, 241, 0.55)'
  if (/rgba?\(/i.test(a)) {
    return a.replace(/[\d.]+\s*\)$/, `${alpha})`)
  }
  return `rgba(99, 102, 241, ${alpha})`
}
