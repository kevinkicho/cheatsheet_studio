import type { CanvasItem, LayoutPanel, PanelShape } from '@/types'
import {
  ORGANIZE_GRID,
  LAYOUT_PANEL_ACCENTS,
  type PanelGroupLevel,
  normalizePanelGroupLevels,
  normalizeLevelSubset,
  normalizeNgonLevels,
} from '../constants'
import {
  folderAtGroupLevel,
  folderHierarchyPath,
  type FolderRef,
  isHeadingCard,
} from '../folders'
import { chromeFromMembers } from '../polyomino'
import { rectPerimeterPathD } from '../geometry'
import type { TopicSectionPlan } from '../sizing'

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
     * Exclusive title stack (multi-level) — each frame owns its chip:
     *   L1: L1 chip (+ room so top-row L2 chip sits under it, not on it)
     *   L2/L3: local chip above that panel's cards
     * Never paint every L2 chip at L1.y+24 (screenshot 014705 garble).
     */
    const L1_CHIP = 22
    // Local L2 chip ≈14px at y+2 → band 16 clears cards; keeps leaf gap at
    // 1 grid cell for pad=4 (2*pad+16=24) so hard-tetris stays dense.
    const L2_CHIP = 16
    const deeperStroke =
      multi &&
      effectiveLevels.some((L) => L > effectiveMinL && borderSet.has(L))
    const titleBand = isOutermost
      ? multi
        ? L1_CHIP + 4 + (deeperStroke ? L2_CHIP : 0) // ~42 with nested, else ~26
        : Math.max(16, titleBandPx)
      : multi
        ? L2_CHIP // local L2/L3 chip band
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
