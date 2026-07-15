import type { CanvasItem, LayoutPanel, PanelShape } from '@/types'
import {
  ORGANIZE_GRID,
  LAYOUT_PANEL_ACCENTS,
  type PanelGroupLevel,
  normalizePanelGroupLevels,
  normalizeLevelSubset,
  normalizeNgonLevels,
} from './constants'
import {
  folderAtGroupLevel,
  folderHierarchyPath,
  type FolderRef,
  isHeadingCard,
} from './folders'
import {
  chromeFromMembers,
  fillPolyominoHoles,
  closePolyomino,
  polyominoExteriorPathD,
} from './polyomino'
import { cellsToOrthogonalRuns } from './freeGrid'
import {
  rectPerimeterPathD,
  panelRunsOverlap,
  rectsOverlap,
} from './geometry'
import type { TopicSectionPlan } from './sizing'

/**
 * Build panel chrome from actual member cards (tight pad).
 * - rect: full AABB
 * - polygon: orthogonal runs of card footprints (n-gon L-fill)
 */
export function buildLayoutPanelsFromMembers(args: {
  plans: TopicSectionPlan[]
  placed: CanvasItem[]
  panelPad: number
  panelShape: PanelShape
  folderName: Map<string, string>
  useLabels: boolean
  /** Extra space above cards for the title strip (px). */
  titleBandPx?: number
  grid?: number
}): LayoutPanel[] {
  const {
    plans,
    placed,
    panelPad,
    panelShape,
    folderName,
    useLabels,
    titleBandPx = 0,
    grid = ORGANIZE_GRID,
  } = args
  const byId = new Map(placed.map((p) => [p.id, p]))
  const panels: LayoutPanel[] = []
  const pad = Math.max(0, panelPad)
  const titleBand = Math.max(0, titleBandPx)

  plans.forEach((plan, planIdx) => {
    const memberIds = [
      ...(useLabels && plan.heading ? [plan.heading.id] : []),
      ...plan.body.map((b) => b.id),
    ]
    const members = memberIds
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => m != null && !m.hidden)
    if (members.length === 0) return

    const folderId =
      plan.groupFolderId ??
      plan.body.find((b) => b.folderId)?.folderId ??
      plan.heading?.folderId ??
      null
    const title =
      (folderId ? folderName.get(folderId) : undefined) ||
      (plan.heading?.title && plan.heading.title.trim()) ||
      plan.body[0]?.title ||
      `Group ${plan.index + 1}`

    const accent =
      LAYOUT_PANEL_ACCENTS[planIdx % LAYOUT_PANEL_ACCENTS.length]
    const id = `panel-${plan.index}-${folderId ?? plan.heading?.id ?? plan.body[0]?.id ?? plan.index}`

    const chrome = chromeFromMembers(members, {
      pad,
      titleBand,
      shape: panelShape,
      grid,
      solidMode: panelShape === 'polygon' ? 'close' : 'solid-aabb',
      closeRadius: 1,
    })
    panels.push({
      id,
      folderId,
      title,
      showTitle: true,
      contentSort: 'none',
      memberIds: members.map((m) => m.id),
      ...chrome,
      shape: panelShape === 'polygon' ? 'polygon' : 'rect',
      accent,
      zIndex: 0,
      hierarchyLevel: undefined,
    })
  })

  return panels
}

/**
 * Nested hierarchy panels for multi-selected levels.
 * Cards are already packed at the deepest level; this only draws chrome.
 *
 * Example levels [1,2]: outer panel per top folder (1, 2, 3…) wrapping inner
 * panels per subsection (1.1, 1.2…).
 *
 * Stroke / shape policy (per-level options):
 * - **borderLevels** — which depths draw a frame stroke (default: outermost only)
 * - **ngonLevels** — which stroking depths use n-gon stepped chrome (default L2+L3
 *   when polygon shape); other borders stay rectangle AABB
 * - Non-border levels: title chip only
 */
export function buildNestedHierarchyPanels(args: {
  placed: CanvasItem[]
  folders: FolderRef[]
  levels: PanelGroupLevel[]
  panelPad: number
  panelShape: PanelShape
  /** Levels that draw stroke. Default: outermost only. */
  borderLevels?: PanelGroupLevel[]
  /**
   * Levels that use n-gon chrome when panelShape is polygon.
   * Default: L2+L3 among border levels.
   */
  ngonLevels?: PanelGroupLevel[]
  folderName: Map<string, string>
  titleBandPx?: number
  grid?: number
  /** Printable content left edge (clamp chrome). */
  contentLeft?: number
  /** Printable content right edge (clamp chrome). */
  contentRight?: number
  /** Printable content top edge (clamp chrome — never into top margin). */
  contentTop?: number
}): LayoutPanel[] {
  const {
    placed,
    folders,
    levels,
    panelPad,
    panelShape,
    folderName,
    titleBandPx = 16,
    grid = ORGANIZE_GRID,
    contentLeft,
    contentRight,
    contentTop,
  } = args
  const sorted = normalizePanelGroupLevels(levels)
  if (sorted.length === 0) return []

  const cards = placed.filter(
    (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
  )
  if (cards.length === 0) return []

  const minL = sorted[0]!
  const multi = sorted.length > 1
  const borderSet = new Set(
    normalizeLevelSubset(args.borderLevels, sorted, true),
  )
  const ngonSet = new Set(
    panelShape === 'polygon'
      ? normalizeNgonLevels(
          args.ngonLevels,
          [...borderSet].sort((a, b) => a - b) as PanelGroupLevel[],
          sorted,
        )
      : [],
  )
  const panels: LayoutPanel[] = []
  let accentIdx = 0

  // Skip deeper levels that collapse to the same folder keys as a shallower
  // selected level (e.g. tree only 2 deep but UI has L2+L3 → double frames).
  const groupKeysAtLevel = (level: PanelGroupLevel): string => {
    const keys: string[] = []
    for (const c of cards) {
      const key = folderAtGroupLevel(c.folderId, folders, level)
      if (key) keys.push(key)
    }
    return [...new Set(keys)].sort().join('\0')
  }
  const effectiveLevels: PanelGroupLevel[] = []
  const seenKeySig = new Set<string>()
  for (const level of sorted) {
    const sig = groupKeysAtLevel(level)
    if (seenKeySig.has(sig)) continue
    seenKeySig.add(sig)
    effectiveLevels.push(level)
  }
  const effectiveMinL = effectiveLevels[0] ?? minL

  for (const level of effectiveLevels) {
    const isOutermost = level === effectiveMinL
    const showStroke = borderSet.has(level)
    // Chrome pad = user pad only (nest gutter comes from nestContain inset,
    // not from inflating outer pad — that caused huge right/bottom empty chrome).
    const pad = showStroke ? Math.max(0, panelPad) : 0
    /**
     * Exclusive title stack (multi-level):
     *   L1 frame: L1 chip + gap + L2 chip band above cards
     *   L2 frame: L2 chip only above cards
     * So L1.y < L2.y and chips never stack on the same band.
     */
    const L1_CHIP = 22
    const L2_CHIP = 18
    // Multi-level: L1 only reserves its own chip band. L2 chips sit on L2
    // frames (not a second exclusive row under L1) — that double-band forced
    // huge inter-topic voids (screenshot 214206).
    const titleBand = isOutermost
      ? multi
        ? L1_CHIP + 4 // ~26
        : Math.max(16, titleBandPx)
      : L2_CHIP

    const groups = new Map<string, CanvasItem[]>()
    for (const c of cards) {
      const key = folderAtGroupLevel(c.folderId, folders, level)
      if (!key) continue
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(c)
    }

    for (const [folderId, members] of groups) {
      if (members.length === 0) continue

      const title =
        folderName.get(folderId) ||
        folderHierarchyPath(folderId, folders) ||
        folderId
      const accent =
        LAYOUT_PANEL_ACCENTS[accentIdx++ % LAYOUT_PANEL_ACCENTS.length]

      // Always use the full user pad. Cards are packed into a chrome-inset
      // band (packLeft/Right) so pad fits inside the content box without
      // collapsing to 0 at the margin edge (screenshot 223755).
      const minX = Math.min(...members.map((m) => m.x))
      const maxX = Math.max(...members.map((m) => m.x + m.width))
      const effPad = pad

      if (!showStroke) {
        // Title chip only — under L1 exclusive band when multi
        const minY = Math.min(...members.map((m) => m.y))
        const maxY = Math.max(...members.map((m) => m.y + m.height))
        let chipY = Math.round(minY - titleBand)
        if (contentTop != null && chipY < contentTop) chipY = contentTop
        panels.push({
          id: `panel-L${level}-${folderId}`,
          folderId,
          title,
          showTitle: true,
          showStroke: false,
          contentSort: 'none',
          memberIds: members.map((m) => m.id),
          x: Math.round(minX),
          y: chipY,
          width: Math.max(8, Math.round(maxX - minX)),
          height: Math.max(8, Math.round(maxY - chipY)),
          shape: 'rect',
          runs: undefined,
          outlinePath: undefined,
          accent,
          zIndex: level - 1,
          hierarchyLevel: level,
        })
        continue
      }

      /**
       * Chrome policy:
       * - Level in n-gon set → stepped blocks (card footprints)
       * - Else → solid AABB rectangle (clean frame)
       *
       * Multi-child L1 is NOT forced to polygon — that produced snaking
       * “weird boxes” connecting free-flow L2s (screenshot 214119).
       */
      const useNgon = ngonSet.has(level)
      const chromeShape: PanelShape = useNgon ? 'polygon' : 'rect'
      const solidMode: 'solid-aabb' | 'close' | 'silhouette' | 'blocks' = useNgon
        ? 'blocks'
        : 'solid-aabb'
      const chrome = chromeFromMembers(members, {
        pad: effPad,
        titleBand,
        shape: chromeShape,
        grid,
        solidMode,
      })
      // Final clamp to print content box (pad/title may still nudge past edge)
      let { x, y, width, height } = chrome
      if (contentLeft != null && x < contentLeft) {
        width -= contentLeft - x
        x = contentLeft
      }
      if (contentRight != null && x + width > contentRight) {
        width = Math.max(8, contentRight - x)
      }
      if (contentTop != null && y < contentTop) {
        height -= contentTop - y
        y = contentTop
      }
      const outline =
        chrome.outlinePath && width >= chrome.width - 1 && y >= (chrome.y ?? y)
          ? chrome.outlinePath
          : rectPerimeterPathD(x, y, width, height)
      // Re-clamp runs into content box
      const runs = (chrome.runs ?? [{ x, y, width, height }]).map((r) => {
        let rx = r.x
        let rw = r.width
        let ry = r.y
        let rh = r.height
        if (contentLeft != null && rx < contentLeft) {
          rw -= contentLeft - rx
          rx = contentLeft
        }
        if (contentRight != null && rx + rw > contentRight) {
          rw = Math.max(8, contentRight - rx)
        }
        if (contentTop != null && ry < contentTop) {
          rh -= contentTop - ry
          ry = contentTop
        }
        return {
          x: Math.round(rx),
          y: Math.round(ry),
          width: Math.max(8, Math.round(rw)),
          height: Math.max(8, Math.round(rh)),
        }
      })
      panels.push({
        id: `panel-L${level}-${folderId}`,
        folderId,
        title,
        showTitle: true,
        showStroke: true,
        contentSort: 'none',
        memberIds: members.map((m) => m.id),
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(8, Math.round(width)),
        height: Math.max(8, Math.round(height)),
        runs,
        shape: chromeShape === 'polygon' ? 'polygon' : 'rect',
        outlinePath: outline,
        accent,
        zIndex: level - 1,
        hierarchyLevel: level,
      })
    }
  }

  // Guarantee L2/L3 origins sit under L1 exclusive chip row
  if (multi) {
    const L1_CHIP = 22
    const outers = panels.filter(
      (p) =>
        p.showStroke !== false &&
        (p.hierarchyLevel ?? 1) === effectiveMinL,
    )
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i]!
      if ((p.hierarchyLevel ?? 1) <= effectiveMinL) continue
      const parent = outers.find(
        (o) =>
          o.memberIds?.length &&
          p.memberIds?.length &&
          p.memberIds.every((id) => o.memberIds!.includes(id)),
      )
      if (!parent) continue
      const minUnder = parent.y + L1_CHIP + 4
      if (p.y >= minUnder) continue
      const members = (p.memberIds ?? [])
        .map((id) => placed.find((c) => c.id === id && !c.hidden))
        .filter((c): c is CanvasItem => Boolean(c))
      const minCardY =
        members.length > 0
          ? Math.min(...members.map((c) => c.y))
          : p.y + p.height
      // Never push chip origin into the card band
      const maxY = minCardY - 16
      const newY = Math.round(Math.min(minUnder, maxY))
      if (newY <= p.y) continue
      const dy = newY - p.y
      panels[i] = {
        ...p,
        y: newY,
        height: Math.max(8, p.height - dy),
        // Keep run tops in sync so fill/stroke match the shifted chip band
        runs: p.runs?.map((r) =>
          Math.abs(r.y - p.y) < 2
            ? { ...r, y: newY, height: Math.max(8, r.height - dy) }
            : r,
        ),
      }
    }
  }

  return panels
}

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

  const isChildOf = (parent: LayoutPanel, child: LayoutPanel) => {
    if (!parent.memberIds?.length || !child.memberIds?.length) return false
    if ((child.hierarchyLevel ?? 1) <= (parent.hierarchyLevel ?? 1)) return false
    const set = new Set(parent.memberIds)
    return child.memberIds.every((id) => set.has(id))
  }

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
    // Match buildNestedHierarchyPanels title bands (L1 multi ~26, L2 ~18)
    const titleExtra =
      p.showTitle === false
        ? 0
        : (p.hierarchyLevel ?? 1) <= 1
          ? 26
          : 18

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
    const children = next.filter((c) => isChildOf(parent, c))
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

  const isChildOf = (parent: LayoutPanel, child: LayoutPanel) => {
    if (!parent.memberIds?.length || !child.memberIds?.length) return false
    if ((child.hierarchyLevel ?? 1) <= (parent.hierarchyLevel ?? 1)) return false
    const set = new Set(parent.memberIds)
    return child.memberIds.every((id) => set.has(id))
  }

  for (let i = 0; i < next.length; i++) {
    const parent = next[i]!
    if (parent.showStroke === false) continue
    const children = next.filter(
      (c) =>
        c.showStroke !== false &&
        isChildOf(parent, c) &&
        (c.hierarchyLevel ?? 1) === (parent.hierarchyLevel ?? 1) + 1,
    )
    // Also accept any deeper nested children if no direct level+1
    const kids =
      children.length >= 2
        ? children
        : next.filter((c) => c.showStroke !== false && isChildOf(parent, c))
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
    const runs = p.runs?.map((r) => {
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
        ...r,
        x: Math.round(rx),
        y: Math.round(ry),
        width: Math.max(8, Math.round(rw)),
        height: Math.max(8, Math.round(rh)),
      }
    })
    const shaved =
      width < p.width - 0.5 ||
      (top != null && y > p.y + 0.5) ||
      height < p.height - 0.5
    const outlinePath =
      p.shape === 'rect' || !p.outlinePath || shaved
        ? rectPerimeterPathD(x, y, Math.max(8, width), Math.max(8, height))
        : p.outlinePath
    return {
      ...p,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(8, Math.round(width)),
      height: Math.max(8, Math.round(height)),
      runs,
      outlinePath,
    }
  })
}

export function mergeAdjacentOutermostPanels(
  panels: LayoutPanel[],
  opts: { grid?: number; panelPad?: number },
): LayoutPanel[] {
  if (panels.length <= 1) return panels
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const pad = Math.max(0, opts.panelPad ?? 8)

  // Merge per hierarchy level among panels that currently stroke
  const levels = Array.from(
    new Set(
      panels
        .filter((p) => p.showStroke !== false)
        .map((p) => p.hierarchyLevel ?? 1),
    ),
  ).sort((a, b) => a - b)

  let result = panels.slice()
  for (const level of levels) {
    result = mergeStrokedPanelsAtLevel(result, level, grid, pad)
  }
  return result
}

function mergeStrokedPanelsAtLevel(
  panels: LayoutPanel[],
  level: number,
  grid: number,
  pad: number,
): LayoutPanel[] {
  const stroked = panels.filter(
    (p) => (p.hierarchyLevel ?? 1) === level && p.showStroke !== false,
  )
  const rest = panels.filter((p) => !stroked.some((o) => o.id === p.id))
  if (stroked.length <= 1) {
    // Still ensure every stroked panel has a visible exterior outline
    return panels.map((p) => {
      if ((p.hierarchyLevel ?? 1) !== level || p.showStroke === false) return p
      const outline =
        p.outlinePath ||
        rectPerimeterPathD(p.x, p.y, p.width, p.height)
      return {
        ...p,
        showStroke: true,
        outlinePath: outline,
      }
    })
  }

  // Merge only when chrome **actually overlaps** (or shares an edge within 1px).
  // Do NOT use large proximity — that chain-merged the whole Everything sheet
  // into one mega n-gon (stroked:1) and wiped per-section borders.
  const parent = stroked.map((_, i) => i)
  const find = (i: number): number => {
    let p = i
    while (parent[p] !== p) p = parent[p]!
    let x = i
    while (parent[x] !== x) {
      const n = parent[x]!
      parent[x] = p
      x = n
    }
    return p
  }
  const unite = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  /** True when panels share area or a flush edge (not merely nearby). */
  const shouldMerge = (a: LayoutPanel, b: LayoutPanel) => {
    // Different topic folders at the same outermost level must keep separate
    // borders — free-flow often packs L1 topics flush against each other.
    if (
      a.folderId &&
      b.folderId &&
      a.folderId !== b.folderId &&
      (a.hierarchyLevel ?? 1) === (b.hierarchyLevel ?? 1)
    ) {
      return false
    }
    // Run/AABB overlap with tiny eps (touching edges count)
    if (panelRunsOverlap(a, b, 0)) return true
    if (rectsOverlap(a, b, 0)) return true
    return false
  }
  for (let i = 0; i < stroked.length; i++) {
    for (let j = i + 1; j < stroked.length; j++) {
      if (shouldMerge(stroked[i]!, stroked[j]!)) unite(i, j)
    }
  }

  const groups = new Map<number, LayoutPanel[]>()
  stroked.forEach((p, i) => {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(p)
  })

  const merged: LayoutPanel[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      const g = group[0]!
      const outline =
        g.outlinePath ||
        rectPerimeterPathD(g.x, g.y, g.width, g.height)
      merged.push({
        ...g,
        showStroke: true,
        outlinePath: outline,
      })
      continue
    }

    const leader = [...group].sort(
      (a, b) => a.y - b.y || a.x - b.x,
    )[0]!
    const minX = Math.min(...group.map((g) => g.x))
    const minY = Math.min(...group.map((g) => g.y))
    const maxX = Math.max(...group.map((g) => g.x + g.width))
    const maxY = Math.max(...group.map((g) => g.y + g.height))

    // Union runs → cells → close gaps → exterior outline only (internal joins
    // between overlapping panels are omitted). Pad expands stroke outward.
    const originX = minX
    const originY = minY
    let unit = new Set<string>()
    for (const g of group) {
      const runs =
        g.runs && g.runs.length > 0
          ? g.runs
          : [{ x: g.x, y: g.y, width: g.width, height: g.height }]
      for (const r of runs) {
        const c0 = Math.floor((r.x - originX) / grid)
        const c1 = Math.ceil((r.x + r.width - originX) / grid)
        const r0 = Math.floor((r.y - originY) / grid)
        const r1 = Math.ceil((r.y + r.height - originY) / grid)
        for (let rr = r0; rr < Math.max(r0 + 1, r1); rr++) {
          for (let cc = c0; cc < Math.max(c0 + 1, c1); cc++) {
            unit.add(`${cc},${rr}`)
          }
        }
      }
    }
    unit = fillPolyominoHoles(unit)
    // Light close only to seal 1-cell gaps at the join — keep L-steps
    unit = closePolyomino(unit, 1)
    const solidCells: Array<{ c: number; r: number; cw: number; ch: number }> =
      []
    for (const k of unit) {
      const [cs, rs] = k.split(',')
      solidCells.push({ c: Number(cs), r: Number(rs), cw: 1, ch: 1 })
    }
    const runsRaw = cellsToOrthogonalRuns(solidCells, grid, originX, originY, 0)
    // Pad > 0 so the exterior stroke is clearly visible outside the fill
    const outlinePath =
      polyominoExteriorPathD(unit, grid, originX, originY, Math.max(2, pad)) ||
      rectPerimeterPathD(minX, minY, maxX - minX, maxY - minY)
    const x0 = Math.min(minX, ...runsRaw.map((r) => r.x)) - pad
    const y0 = Math.min(minY, ...runsRaw.map((r) => r.y)) - pad
    const x1 = Math.max(maxX, ...runsRaw.map((r) => r.x + r.width)) + pad
    const y1 = Math.max(maxY, ...runsRaw.map((r) => r.y + r.height)) + pad

    for (const g of group) {
      if (g.id === leader.id) {
        merged.push({
          ...g,
          x: Math.round(x0),
          y: Math.round(y0),
          width: Math.max(8, Math.round(x1 - x0)),
          height: Math.max(8, Math.round(y1 - y0)),
          runs: runsRaw.map((r) => ({
            x: Math.round(r.x - pad),
            y: Math.round(r.y - pad),
            width: Math.max(8, Math.round(r.width + pad * 2)),
            height: Math.max(8, Math.round(r.height + pad * 2)),
          })),
          outlinePath,
          shape: 'polygon',
          showStroke: true,
        })
      } else {
        // Sibling in merged component: title chip only (no second border)
        merged.push({
          ...g,
          showStroke: false,
          outlinePath: undefined,
          runs: undefined,
          shape: 'rect',
        })
      }
    }
  }

  return [...merged, ...rest]
}

/**
 * Move a layout panel and its member cards by (dx, dy). Nested child panels
 * whose members are a subset of the moved set also translate. Chrome is
 * rebuilt from member geometry after the move.
 */
export function translateLayoutPanelCluster(
  items: CanvasItem[],
  panels: LayoutPanel[],
  panelId: string,
  dx: number,
  dy: number,
  opts?: { grid?: number; panelPad?: number },
): { items: CanvasItem[]; panels: LayoutPanel[] } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { items, panels }
  }
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return { items, panels }
  }
  const panel = panels.find((p) => p.id === panelId)
  if (!panel?.memberIds?.length) return { items, panels }

  const rootIds = new Set(panel.memberIds)
  // Nested panels fully contained in this panel's membership also move
  const related = panels.filter(
    (p) =>
      p.id === panelId ||
      (p.memberIds?.length && p.memberIds.every((id) => rootIds.has(id))),
  )
  const moveIds = new Set<string>()
  for (const p of related) {
    for (const id of p.memberIds ?? []) moveIds.add(id)
  }

  const nextItems = items.map((it) => {
    if (!moveIds.has(it.id) || it.locked) return it
    return {
      ...it,
      x: Math.round(it.x + dx),
      y: Math.round(it.y + dy),
    }
  })
  const byId = new Map(nextItems.map((i) => [i.id, i]))
  const grid = opts?.grid ?? ORGANIZE_GRID
  const pad = opts?.panelPad ?? 8

  const nextPanels = panels.map((p) => {
    if (!related.some((r) => r.id === p.id)) return p
    const members = (p.memberIds ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => m != null && !m.hidden)
    if (members.length === 0) {
      return {
        ...p,
        x: Math.round(p.x + dx),
        y: Math.round(p.y + dy),
      }
    }
    const level = p.hierarchyLevel ?? 1
    const titleBand =
      p.showTitle === false
        ? 0
        : 16 + (level <= 1 && (p.showStroke !== false) ? 12 : 0)
    const chrome = chromeFromMembers(members, {
      pad: level <= 1 ? pad + 4 : pad,
      titleBand,
      shape: p.shape === 'polygon' ? 'polygon' : 'rect',
      grid,
    })
    return {
      ...p,
      ...chrome,
      shape: p.shape,
      showStroke: p.showStroke,
    }
  })

  return { items: nextItems, panels: nextPanels }
}

/**
 * Re-pack cards inside one panel (shelf within panel content box).
 * Used when user sets contentSort or after showTitle changes title band.
 */
export function relayoutPanelContents(
  items: CanvasItem[],
  panel: LayoutPanel,
  opts?: {
    grid?: number
    gapPx?: number
    panelPad?: number
    /** shelf = keep sizes; dense = pack + optional scale-to-fit + rebuild chrome */
    mode?: 'shelf' | 'dense'
  },
): { items: CanvasItem[]; panel: LayoutPanel } {
  const ids = new Set(panel.memberIds ?? [])
  if (ids.size === 0) return { items, panel }

  const gap = Math.max(2, opts?.gapPx ?? 6)
  const showTitle = panel.showTitle !== false
  const titleBand = showTitle ? 16 : 0
  const pad = Math.max(2, opts?.panelPad ?? 4)
  const grid = opts?.grid ?? ORGANIZE_GRID
  const dense = opts?.mode === 'dense'

  let members = items.filter((i) => ids.has(i.id) && !i.hidden)
  if ((panel.contentSort ?? 'none') === 'none' && panel.memberIds?.length) {
    const rank = new Map(panel.memberIds.map((id, i) => [id, i]))
    members = [...members].sort(
      (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
    )
  }
  const sort = panel.contentSort ?? 'none'
  if (sort === 'name-asc' || sort === 'name-desc') {
    const dir = sort === 'name-desc' ? -1 : 1
    members = [...members].sort((a, b) => {
      const ta = (a.title ?? a.latex ?? a.id).toLocaleLowerCase()
      const tb = (b.title ?? b.latex ?? b.id).toLocaleLowerCase()
      if (ta < tb) return -1 * dir
      if (ta > tb) return 1 * dir
      return a.id.localeCompare(b.id)
    })
  }
  if (members.length === 0) return { items, panel }

  // Target content box from current panel (dense: use panel as budget)
  const contentX = panel.x + pad
  const contentY = panel.y + pad + titleBand
  const contentW = Math.max(
    48,
    panel.width - pad * 2,
    ...members.map((m) => m.width),
  )
  const contentH = Math.max(48, panel.height - pad * 2 - titleBand)

  // Dense: try natural pack widths, pick densest that fits contentW
  type Place = { id: string; x: number; y: number; w: number; h: number }
  let places: Place[] = []

  if (dense) {
    // Shelf pack at current sizes; if overflows height, uniform scale down
    const packShelf = (scale: number) => {
      const out: Place[] = []
      let x = contentX
      let y = contentY
      let rowH = 0
      for (const m of members) {
        const w = Math.max(24, Math.round(m.width * scale))
        const h = Math.max(20, Math.round(m.height * scale))
        if (x > contentX && x + w > contentX + contentW) {
          x = contentX
          y += rowH + gap
          rowH = 0
        }
        // Clamp single card wider than box
        const ww = Math.min(w, contentW)
        out.push({ id: m.id, x: Math.round(x), y: Math.round(y), w: ww, h })
        x += ww + gap
        rowH = Math.max(rowH, h)
      }
      const bottom = out.reduce((b, p) => Math.max(b, p.y + p.h), contentY)
      return { out, height: bottom - contentY }
    }
    let scale = 1
    let best = packShelf(1)
    // Shrink until fits panel height (or scale floor)
    while (best.height > contentH + 2 && scale > 0.55) {
      scale *= 0.9
      best = packShelf(scale)
    }
    places = best.out
  } else {
    // Simple shelf (keep sizes) — contentSort path
    let x = contentX
    let y = contentY
    let rowH = 0
    for (const m of members) {
      const w = m.width
      const h = m.height
      if (x > contentX && x + w > contentX + contentW) {
        x = contentX
        y += rowH + gap
        rowH = 0
      }
      places.push({
        id: m.id,
        x: Math.round(x),
        y: Math.round(y),
        w,
        h,
      })
      x += w + gap
      rowH = Math.max(rowH, h)
    }
  }

  const byPlace = new Map(places.map((p) => [p.id, p]))
  const nextItems = items.map((it) => {
    const p = byPlace.get(it.id)
    if (!p) return it
    return {
      ...it,
      x: p.x,
      y: p.y,
      width: dense ? p.w : it.width,
      height: dense ? p.h : it.height,
    }
  })

  const moved = nextItems.filter((i) => ids.has(i.id) && !i.hidden)
  if (moved.length === 0) return { items: nextItems, panel }

  // Rebuild chrome so n-gon outline fully wraps reflowed cards
  const shape: PanelShape = panel.shape === 'polygon' ? 'polygon' : 'rect'
  const chrome = chromeFromMembers(moved, {
    pad,
    titleBand,
    shape,
    grid,
  })
  const nextPanel: LayoutPanel = {
    ...panel,
    ...chrome,
    shape,
    // Preserve identity / hierarchy
    id: panel.id,
    folderId: panel.folderId,
    title: panel.title,
    showTitle: panel.showTitle,
    contentSort: panel.contentSort,
    memberIds: panel.memberIds,
    accent: panel.accent,
    zIndex: panel.zIndex,
    hierarchyLevel: panel.hierarchyLevel,
  }
  return { items: nextItems, panel: nextPanel }
}
