/**
 * Post-place refine: densify leaves, hierarchical re-pack, gaps, multipage seams.
 */
import type { CanvasItem } from '@/types'
import type { PanelGroupLevel } from '../constants'
import type { FolderRef } from '../folders'
import {
  densifyPlacedGroups,
  repackLeafInteriors,
  ensureLeafTitleClearance,
  resolveLeafGroupCollisions,
  gravityCompactGroups,
  repackGroupsInParents,
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
  l2ContentClearPx: number
  interTopicChromePx: number
  outerTitleCells: number
  panelPad: number
  panelTitleBandPx: number
  multiPage: boolean
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
    interTopicChromePx,
    outerTitleCells,
    panelPad,
    panelTitleBandPx,
    multiPage,
    box,
  } = opts
  const hasFolders = folders.length > 0

  // Close voids per leaf group, then multi-order free-flow interiors
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

  if (usePanels && leafLevelsStroke && hasFolders) {
    result = resolveLeafGroupCollisions(result, folders, deepLevel, {
      grid,
      minGapPx: Math.max(0, l2ContentClearPx),
      parentLevel: shallowLevel,
    })
  }

  if (usePanels && multiLevelHierarchy && hasFolders) {
    const interParentGapPx = Math.max(
      0,
      l1GapPx + (outerLevelsStroke ? panelPad * 2 : 0),
    )
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
        gapCells: leafGapCells,
        parentGapPx: interParentGapPx,
        titleCells: outerTitleCells,
      },
    )
  } else if (usePanels && hasFolders) {
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

  if (usePanels && hasFolders) {
    const stackGap = multiLevelHierarchy
      ? Math.max(0, l1GapPx + (outerLevelsStroke ? panelPad * 2 : 0))
      : interTopicChromePx
    result = separateFolderClusters(result, folders, shallowLevel, {
      grid,
      minGapPx: stackGap,
    })
  }

  // Pixel-exact block gap AFTER hierarchical repositions
  if (hasFolders && blockGapPx > 0) {
    result = separateLeafCardsByGap(result, folders, deepLevel, {
      grid,
      minGapPx: blockGapPx,
      contentRight: packRight,
    })
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

  return result
}
