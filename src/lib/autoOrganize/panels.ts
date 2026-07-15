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

  // Inner levels that stroke — outer needs extra pad so L2 never collinear with L1
  const nestedStrokeDepths = [...borderSet].filter((L) => L > effectiveMinL)

  for (const level of effectiveLevels) {
    const isOutermost = level === effectiveMinL
    const showStroke = borderSet.has(level)
    // Chrome pad = user pad; outer multi-level gets nest margin so L2 sits inside
    const nestMargin =
      isOutermost && multi && nestedStrokeDepths.length > 0
        ? Math.max(8, panelPad + 6)
        : 0
    const pad = showStroke ? Math.max(0, panelPad) + nestMargin : 0
    /**
     * Exclusive title stack (multi-level):
     *   L1 frame: L1 chip + gap + L2 chip band above cards
     *   L2 frame: L2 chip only above cards
     * So L1.y < L2.y and chips never stack on the same band.
     */
    const L1_CHIP = 22
    const L2_CHIP = 18
    const titleBand = isOutermost
      ? multi
        ? L1_CHIP + 4 + L2_CHIP // ~44: exclusive L1 row + L2 chip under it
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

      // Clamp pad so chrome never leaves the printable content box
      const minX = Math.min(...members.map((m) => m.x))
      const maxX = Math.max(...members.map((m) => m.x + m.width))
      let effPad = pad
      if (contentLeft != null) {
        effPad = Math.min(effPad, Math.max(0, minX - contentLeft))
      }
      if (contentRight != null) {
        effPad = Math.min(effPad, Math.max(0, contentRight - maxX))
      }

      if (!showStroke) {
        // Title chip only — under L1 exclusive band when multi
        const minY = Math.min(...members.map((m) => m.y))
        const maxY = Math.max(...members.map((m) => m.y + m.height))
        const chipY = Math.round(minY - titleBand)
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
          height: Math.max(8, Math.round(maxY - minY + titleBand)),
          shape: 'rect',
          runs: undefined,
          outlinePath: undefined,
          accent,
          zIndex: level - 1,
          hierarchyLevel: level,
        })
        continue
      }

      // N-gon levels → tetris row-block chrome; else solid rect AABB
      const useNgon = ngonSet.has(level)
      const chromeShape: PanelShape = useNgon ? 'polygon' : 'rect'
      const solidMode: 'solid-aabb' | 'close' | 'silhouette' | 'blocks' =
        useNgon ? 'blocks' : 'solid-aabb'
      const chrome = chromeFromMembers(members, {
        pad: effPad,
        titleBand,
        shape: chromeShape,
        grid,
        solidMode,
      })
      // Final clamp to print content box (pad may still nudge past edge)
      let { x, y, width, height } = chrome
      if (contentLeft != null && x < contentLeft) {
        width -= contentLeft - x
        x = contentLeft
      }
      if (contentRight != null && x + width > contentRight) {
        width = Math.max(8, contentRight - x)
      }
      const outline =
        chrome.outlinePath && width >= chrome.width - 1
          ? chrome.outlinePath
          : rectPerimeterPathD(x, y, width, height)
      // Re-clamp runs into content box
      const runs = (chrome.runs ?? [{ x, y, width, height }]).map((r) => {
        let rx = r.x
        let rw = r.width
        if (contentLeft != null && rx < contentLeft) {
          rw -= contentLeft - rx
          rx = contentLeft
        }
        if (contentRight != null && rx + rw > contentRight) {
          rw = Math.max(8, contentRight - rx)
        }
        return {
          x: Math.round(rx),
          y: Math.round(r.y),
          width: Math.max(8, Math.round(rw)),
          height: Math.max(8, Math.round(r.height)),
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
 * Ensure nested L2/L3 frames sit strictly inside their L1 parent with a clear
 * nest gutter (not collinear double borders). Prefer **insetting children**
 * over expanding parents (expanding L1s made sibling L1 AABBs collide).
 * Only grow the parent when a child still escapes after inset (escape fix).
 */
export function nestContainPanels(
  panels: LayoutPanel[],
  opts?: { insetPx?: number; contentLeft?: number; contentRight?: number },
): LayoutPanel[] {
  if (panels.length <= 1) return panels
  const inset = Math.max(2, opts?.insetPx ?? 4)
  const left = opts?.contentLeft
  const right = opts?.contentRight
  let next = panels.map((p) => ({ ...p }))

  const isChildOf = (parent: LayoutPanel, child: LayoutPanel) => {
    if (!parent.memberIds?.length || !child.memberIds?.length) return false
    if ((child.hierarchyLevel ?? 1) <= (parent.hierarchyLevel ?? 1)) return false
    const set = new Set(parent.memberIds)
    return child.memberIds.every((id) => set.has(id))
  }

  const clampChildInto = (
    child: LayoutPanel,
    parent: LayoutPanel,
  ): LayoutPanel => {
    const px0 = parent.x + inset
    const py0 = parent.y + inset
    const px1 = parent.x + parent.width - inset
    const py1 = parent.y + parent.height - inset
    // Parent too tight for inset — use half-space
    const ix0 = px1 > px0 + 8 ? px0 : parent.x + 1
    const iy0 = py1 > py0 + 8 ? py0 : parent.y + 1
    const ix1 = px1 > px0 + 8 ? px1 : parent.x + parent.width - 1
    const iy1 = py1 > py0 + 8 ? py1 : parent.y + parent.height - 1
    let x = child.x
    let y = child.y
    let w = child.width
    let h = child.height
    if (x < ix0) {
      w -= ix0 - x
      x = ix0
    }
    if (y < iy0) {
      h -= iy0 - y
      y = iy0
    }
    if (x + w > ix1) w = Math.max(8, ix1 - x)
    if (y + h > iy1) h = Math.max(8, iy1 - y)
    if (
      x === child.x &&
      y === child.y &&
      w === child.width &&
      h === child.height
    ) {
      return child
    }
    const runsSrc =
      child.runs && child.runs.length > 0
        ? child.runs
        : [
            {
              x: child.x,
              y: child.y,
              width: child.width,
              height: child.height,
            },
          ]
    const runs = runsSrc.map((r) => {
      let rx = r.x
      let ry = r.y
      let rw = r.width
      let rh = r.height
      if (rx < ix0) {
        rw -= ix0 - rx
        rx = ix0
      }
      if (ry < iy0) {
        rh -= iy0 - ry
        ry = iy0
      }
      if (rx + rw > ix1) rw = Math.max(8, ix1 - rx)
      if (ry + rh > iy1) rh = Math.max(8, iy1 - ry)
      return {
        x: Math.round(rx),
        y: Math.round(ry),
        width: Math.max(8, Math.round(rw)),
        height: Math.max(8, Math.round(rh)),
      }
    })
    return {
      ...child,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(8, Math.round(w)),
      height: Math.max(8, Math.round(h)),
      runs: child.showStroke === false ? undefined : runs,
      outlinePath:
        child.showStroke === false
          ? undefined
          : child.shape === 'polygon' &&
              child.outlinePath &&
              x === child.x &&
              y === child.y
            ? child.outlinePath
            : rectPerimeterPathD(x, y, Math.max(8, w), Math.max(8, h)),
    }
  }

  // 1) Inset every child into its parent (primary nest fix)
  for (let i = 0; i < next.length; i++) {
    const child = next[i]!
    const parent = next.find(
      (p) =>
        p.id !== child.id &&
        p.showStroke !== false &&
        (p.hierarchyLevel ?? 1) < (child.hierarchyLevel ?? 1) &&
        isChildOf(p, child),
    )
    if (!parent) continue
    next[i] = clampChildInto(child, parent)
  }

  // 2) If a stroked child still escapes, grow parent just enough (escape only)
  for (let i = 0; i < next.length; i++) {
    const parent = next[i]!
    if (parent.showStroke === false) continue
    const children = next.filter(
      (c) => c.showStroke !== false && isChildOf(parent, c),
    )
    if (children.length === 0) continue
    let minX = parent.x
    let minY = parent.y
    let maxX = parent.x + parent.width
    let maxY = parent.y + parent.height
    let need = false
    for (const c of children) {
      if (
        c.x < parent.x + 0.5 ||
        c.y < parent.y + 0.5 ||
        c.x + c.width > parent.x + parent.width - 0.5 ||
        c.y + c.height > parent.y + parent.height - 0.5
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
    // Do not grow into a same-level sibling AABB
    for (const sib of next) {
      if (sib.id === parent.id) continue
      if ((sib.hierarchyLevel ?? 1) !== (parent.hierarchyLevel ?? 1)) continue
      if (sib.showStroke === false) continue
      // If sibling is to the right, don't expand past sib.x
      if (sib.x >= parent.x + parent.width - 1 && maxX > sib.x - 2) {
        maxX = Math.min(maxX, sib.x - 2)
      }
      if (sib.y >= parent.y + parent.height - 1 && maxY > sib.y - 2) {
        maxY = Math.min(maxY, sib.y - 2)
      }
    }
    const x = Math.round(minX)
    const y = Math.round(minY)
    const width = Math.max(8, Math.round(maxX - x))
    const height = Math.max(8, Math.round(maxY - y))
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

  // 3) Final child clamp after any parent growth
  for (let i = 0; i < next.length; i++) {
    const child = next[i]!
    const parent = next.find(
      (p) =>
        p.id !== child.id &&
        p.showStroke !== false &&
        (p.hierarchyLevel ?? 1) < (child.hierarchyLevel ?? 1) &&
        isChildOf(p, child),
    )
    if (!parent) continue
    next[i] = clampChildInto(child, parent)
  }

  return next
}

/** Hard clamp panel chrome into the printable content box (left/right). */
export function clampPanelsToContentBox(
  panels: LayoutPanel[],
  box: { left: number; right: number },
): LayoutPanel[] {
  const left = box.left
  const right = box.right
  if (!(right > left)) return panels
  return panels.map((p) => {
    let x = p.x
    let width = p.width
    if (x < left) {
      width -= left - x
      x = left
    }
    if (x + width > right) {
      width = Math.max(8, right - x)
    }
    const runs = p.runs?.map((r) => {
      let rx = r.x
      let rw = r.width
      if (rx < left) {
        rw -= left - rx
        rx = left
      }
      if (rx + rw > right) {
        rw = Math.max(8, right - rx)
      }
      return {
        ...r,
        x: Math.round(rx),
        width: Math.max(8, Math.round(rw)),
      }
    })
    const outlinePath =
      p.shape === 'rect' || !p.outlinePath || width < p.width - 0.5
        ? rectPerimeterPathD(x, p.y, Math.max(8, width), p.height)
        : p.outlinePath
    return {
      ...p,
      x: Math.round(x),
      width: Math.max(8, Math.round(width)),
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
