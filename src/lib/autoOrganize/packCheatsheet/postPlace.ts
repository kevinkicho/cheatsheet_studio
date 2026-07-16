/**
 * Post-place refine: densify leaves, hierarchical re-pack, gaps, multipage seams.
 *
 * ⚠ FREEZE — see LAYOUT_INVARIANTS.md + sheet.invariants.test.ts
 * Do not add global gravity/refit or cross-L1 freefall. Thrash history:
 * densify ↔ L1 order ↔ Chemistry empty shells ↔ H/V gap asymmetry.
 *
 * Multi-level phase contract:
 * 1. densify card interiors inside each leaf
 * 2. repack L2 AABBs *inside each L1* (densest), stack L1s by groupSort
 * 3. axis-aware L2 min-gap (content clear)
 * 4. restack L1 clusters (hard order guarantee)
 * 5. block gap + re-clear L2
 * 6. final L1 restack
 */
import type { CanvasItem } from '@/types'
import type { GroupSortOrder, PanelGroupLevel } from '../constants'
import type { FolderRef } from '../folders'
import {
  densifyPlacedGroups,
  repackLeafInteriors,
  ensureLeafTitleClearance,
  resolveLeafGroupCollisions,
  gravityCompactGroups,
  repackGroupsInParents,
  restackParentClusters,
  separateFolderClusters,
  resolveCardOverlaps,
  separateLeafCardsByGap,
} from '../densify'
import {
  resolveMultipageStraddles,
  insertPageGutters,
} from '../multipage'

export type PostPlaceOpts = {
  grid: number
  packLeft: number
  packTop: number
  packRight: number
  pageCols: number
  folders: FolderRef[]
  usePanels: boolean
  multiLevelHierarchy: boolean
  deepLevel: PanelGroupLevel
  shallowLevel: PanelGroupLevel
  leafLevelsStroke: boolean
  outerLevelsStroke: boolean
  blockGapCells: number
  blockGapPx: number
  leafGapCells: number
  l1GapPx: number
  /** @deprecated Prefer l2ContentClearH / l2ContentClearV. Vertical fallback. */
  l2ContentClearPx: number
  /** Side-by-side L2 content AABB min gap (no title). */
  l2ContentClearH?: number
  /** Stacked L2 content AABB min gap (includes title band). */
  l2ContentClearV?: number
  interTopicChromePx: number
  outerTitleCells: number
  panelPad: number
  panelTitleBandPx: number
  multiPage: boolean
  /** Sheet groupSort — locks L1 stack order; L2s densify inside each L1. */
  groupSort?: GroupSortOrder
  /** Pack content box for multipage gutters. */
  box: {
    top: number
    height: number
    pageHeight: number
    margins: { top: number }
    dissolved?: boolean
  }
}

/**
 * After free-flow placement + snap: densify, hierarchical re-pack, exact gaps,
 * multipage seam resolution.
 */
export function refinePlacedCards(
  placed: CanvasItem[],
  opts: PostPlaceOpts,
): CanvasItem[] {
  let result = placed
  const {
    grid,
    packLeft,
    packTop,
    packRight,
    pageCols,
    folders,
    usePanels,
    multiLevelHierarchy,
    deepLevel,
    shallowLevel,
    leafLevelsStroke,
    outerLevelsStroke,
    blockGapCells,
    blockGapPx,
    leafGapCells,
    l1GapPx,
    l2ContentClearPx,
    l2ContentClearH,
    l2ContentClearV,
    interTopicChromePx,
    outerTitleCells,
    panelPad,
    panelTitleBandPx,
    multiPage,
    groupSort = 'none',
    box,
  } = opts
  const hasFolders = folders.length > 0
  const preserveOrder =
    groupSort === 'name-asc' || groupSort === 'name-desc'
  const clearH = Math.max(0, l2ContentClearH ?? l2ContentClearPx)
  const clearV = Math.max(0, l2ContentClearV ?? l2ContentClearPx)
  const interParentGapPx = Math.max(
    0,
    l1GapPx + (outerLevelsStroke ? panelPad * 2 : 0),
  )

  const resolveL2 = (items: CanvasItem[]) =>
    leafLevelsStroke && hasFolders
      ? resolveLeafGroupCollisions(items, folders, deepLevel, {
          grid,
          minGapX: clearH,
          minGapY: clearV,
          minGapPx: clearV,
          parentLevel: shallowLevel,
          contentRight: packRight,
        })
      : items

  const restackL1 = (items: CanvasItem[]) =>
    multiLevelHierarchy && hasFolders
      ? restackParentClusters(items, folders, shallowLevel, {
          grid,
          contentLeft: packLeft,
          contentTop: packTop,
          contentRight: packRight,
          parentGapPx: interParentGapPx,
          groupSort,
        })
      : items

  // ── 1) Card interiors per leaf ──────────────────────────────────────────
  if (usePanels && hasFolders) {
    result = densifyPlacedGroups(result, folders, deepLevel, {
      grid,
      contentLeft: packLeft,
      contentTop: packTop,
      contentRight: packRight,
      pageCols,
      gapCells: blockGapCells,
    })
    result = repackLeafInteriors(result, folders, deepLevel, {
      grid,
      contentLeft: packLeft,
      contentRight: packRight,
      gapCells: blockGapCells,
    })
  }

  if (usePanels && multiLevelHierarchy) {
    result = ensureLeafTitleClearance(
      result,
      folders,
      deepLevel,
      Math.max(18, panelTitleBandPx),
      grid,
    )
  }

  result = resolveCardOverlaps(result, {
    grid,
    contentRight: packRight,
  })

  // ── 2) Hierarchical: densest L2s inside each L1, L1s stacked by sort ───
  if (usePanels && multiLevelHierarchy && hasFolders) {
    result = repackGroupsInParents(
      result,
      folders,
      deepLevel,
      shallowLevel,
      {
        grid,
        contentLeft: packLeft,
        contentTop: packTop,
        contentRight: packRight,
        // 0-cell free-flow inside L1; pixel L2 clear opens exact gap after
        gapCells: leafGapCells,
        parentGapPx: interParentGapPx,
        titleCells: outerTitleCells,
        groupSort,
        denseLeaves: true,
        // Within-parent densify (not global freefall)
        leafGapXPx: clearH,
        leafGapYPx: clearV,
      },
    )
  } else if (usePanels && hasFolders && !preserveOrder) {
    result = gravityCompactGroups(result, folders, deepLevel, {
      grid,
      gapPx: Math.max(
        0,
        l1GapPx + (outerLevelsStroke ? panelPad * 2 : 0),
      ),
      contentLeft: packLeft,
      contentTop: packTop,
      contentRight: packRight,
    })
  }

  // ── 3) L2 min-gap (axis-aware) ──────────────────────────────────────────
  result = resolveL2(result)

  // ── 4) Hard L1 order (Biology → Chemistry → …) ─────────────────────────
  if (usePanels && multiLevelHierarchy && hasFolders) {
    result = restackL1(result)
  } else if (usePanels && hasFolders) {
    result = separateFolderClusters(result, folders, shallowLevel, {
      grid,
      minGapPx: interTopicChromePx,
      contentRight: packRight,
    })
  }

  // ── 5) Block gap then re-clear L2 ───────────────────────────────────────
  if (hasFolders && blockGapPx > 0) {
    result = separateLeafCardsByGap(result, folders, deepLevel, {
      grid,
      minGapPx: blockGapPx,
      contentRight: packRight,
    })
  }
  result = resolveL2(result)

  // ── 6) Final L1 restack (block gap may have shifted clusters) ───────────
  if (usePanels && multiLevelHierarchy && hasFolders) {
    result = restackL1(result)
    result = resolveL2(result)
  }

  // Final hard clamp into chrome-inset pack band
  result = result.map((it) => {
    if (it.hidden) return it
    let x = it.x
    let y = it.y
    let w = it.width
    let h = it.height
    if (x < packLeft) {
      w -= packLeft - x
      x = packLeft
    }
    if (x + w > packRight) {
      x = Math.max(packLeft, packRight - w)
      if (x + w > packRight) w = Math.max(grid, packRight - x)
    }
    if (y < packTop) y = packTop
    return {
      ...it,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(grid, Math.round(w)),
      height: Math.max(grid, Math.round(h)),
    }
  })

  // Multipage seams
  if (multiPage && box.dissolved) {
    result = resolveMultipageStraddles(result, {
      pageHeight: box.height,
      marginTop: box.top,
      contentHeight: box.height,
      grid,
      mode: 'continuous',
    })
  } else if (multiPage) {
    result = resolveMultipageStraddles(result, {
      pageHeight: box.height,
      marginTop: box.top,
      contentHeight: box.height,
      grid,
      mode: 'continuous',
    })
    result = insertPageGutters(result, {
      pageHeight: box.pageHeight,
      marginTop: box.margins.top,
      contentHeight: box.height,
    })
    result = resolveMultipageStraddles(result, {
      pageHeight: box.pageHeight,
      marginTop: box.margins.top,
      contentHeight: box.height,
      grid,
      mode: 'board',
    })
  }

  // Final global de-overlap (cross-folder too). Hierarchical re-pack + multipage
  // can reintroduce paint stacks after the earlier same-leaf pass.
  result = resolveCardOverlaps(result, {
    grid,
    contentRight: packRight,
  })

  return result
}
