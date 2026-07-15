/**
 * Build + nest + enforce layout panel chrome after cards are final.
 */
import type { CanvasItem, LayoutPanel, PanelShape } from '@/types'
import {
  normalizeLevelSubset,
  normalizeNgonLevels,
  type PanelGroupLevel,
} from '../constants'
import type { FolderRef } from '../folders'
import type { TopicSectionPlan } from '../sizing'
import {
  resolveSameLevelPanelCollisions,
  enforcePanelLayoutInvariants,
} from '../densify'
import {
  buildNestedHierarchyPanels,
  buildLayoutPanelsFromMembers,
  mergeAdjacentOutermostPanels,
  nestContainPanels,
  rebuildMultiChildOuters,
  clampPanelsToContentBox,
  clipNestedPanelRunsToParents,
} from '../panels'

export type FinalizePanelsOpts = {
  grid: number
  panelPad: number
  panelShape: PanelShape
  usePolyomino: boolean
  useLabels: boolean
  multiLevelHierarchy: boolean
  panelGroupLevels: PanelGroupLevel[]
  panelBorderLevels?: PanelGroupLevel[]
  panelNgonLevels?: PanelGroupLevel[]
  folders: FolderRef[]
  l1GapPx: number
  l2GapPx: number
  panelTitleBandPx: number
  contentLeft: number
  contentRight: number
  contentTop: number
}

/**
 * Nested hierarchy panels (or flat fallback) + collision/nest/enforce/clamp.
 */
export function finalizeLayoutPanels(
  placed: CanvasItem[],
  merged: CanvasItem[],
  plans: TopicSectionPlan[],
  opts: FinalizePanelsOpts,
): { items: CanvasItem[]; layoutPanels: LayoutPanel[] } {
  const {
    grid,
    panelPad,
    panelShape,
    usePolyomino,
    useLabels,
    multiLevelHierarchy,
    panelGroupLevels,
    folders,
    l1GapPx,
    l2GapPx,
    panelTitleBandPx,
    contentLeft,
    contentRight,
    contentTop,
  } = opts

  let nextItems = merged
  let layoutPanels: LayoutPanel[] = []

  const folderName = new Map(folders.map((f) => [f.id, f.name ?? f.id]))
  const borderLevels = normalizeLevelSubset(
    opts.panelBorderLevels,
    panelGroupLevels,
    /* defaultOuterOnly */ true,
  )
  const ngonLevels =
    panelShape === 'polygon'
      ? normalizeNgonLevels(
          opts.panelNgonLevels,
          borderLevels,
          panelGroupLevels,
        )
      : []
  const shallowLevel = panelGroupLevels[0] ?? 1

  layoutPanels = buildNestedHierarchyPanels({
    placed,
    folders,
    levels: panelGroupLevels,
    panelPad,
    panelShape: usePolyomino ? 'polygon' : 'rect',
    borderLevels,
    ngonLevels,
    folderName,
    titleBandPx: panelTitleBandPx,
    grid,
    contentLeft,
    contentRight,
    contentTop,
  })

  if (layoutPanels.length === 0) {
    layoutPanels = buildLayoutPanelsFromMembers({
      plans,
      placed,
      panelPad,
      panelShape: usePolyomino ? 'polygon' : 'rect',
      folderName,
      useLabels,
      titleBandPx: panelTitleBandPx,
      grid,
    })
  }

  if (layoutPanels.length > 1) {
    layoutPanels = mergeAdjacentOutermostPanels(layoutPanels, {
      grid,
      panelPad,
    })
  }

  layoutPanels = resolveSameLevelPanelCollisions(layoutPanels, {
    grid,
    panelPad,
    placed,
    contentLeft,
    contentRight,
    multiLevel: multiLevelHierarchy,
    outerLevel: shallowLevel,
  })

  layoutPanels = nestContainPanels(layoutPanels, {
    insetPx: multiLevelHierarchy ? Math.max(2, panelPad) : 0,
    contentLeft,
    contentRight,
    contentTop,
    placed,
    panelPad,
  })

  const outerIsNgon =
    panelShape === 'polygon' &&
    normalizeNgonLevels(
      opts.panelNgonLevels,
      borderLevels,
      panelGroupLevels,
    ).includes(shallowLevel)
  if (multiLevelHierarchy && outerIsNgon) {
    layoutPanels = rebuildMultiChildOuters(layoutPanels, {
      panelPad,
      titleBandPx: panelTitleBandPx,
      contentLeft,
      contentRight,
      contentTop,
      grid,
    })
  }

  {
    const fixed = enforcePanelLayoutInvariants(nextItems, layoutPanels, {
      grid,
      panelPad,
      contentLeft,
      contentRight,
      contentTop,
      minGapPx: Math.max(0, l1GapPx),
      l1GapPx: Math.max(0, l1GapPx),
      l2GapPx: Math.max(0, l2GapPx),
    })
    const movedById = new Map(fixed.items.map((i) => [i.id, i]))
    nextItems = nextItems.map((it) => movedById.get(it.id) ?? it)
    layoutPanels = fixed.panels
  }

  layoutPanels = nestContainPanels(layoutPanels, {
    insetPx: multiLevelHierarchy ? Math.max(2, panelPad) : 0,
    contentLeft,
    contentRight,
    contentTop,
    placed: nextItems,
    panelPad,
  })

  layoutPanels = clipNestedPanelRunsToParents(layoutPanels)

  layoutPanels = clampPanelsToContentBox(layoutPanels, {
    left: contentLeft,
    right: contentRight,
    top: contentTop,
  })

  return { items: nextItems, layoutPanels }
}
