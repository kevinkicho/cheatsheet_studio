import {
  ORGANIZE_GRID,
  relayoutPanelContents,
  resizeLayoutPanelCluster,
  translateLayoutPanelCluster,
} from '@/lib/autoOrganize'
import { LAYOUT_PANEL_ACCENTS } from '@/lib/autoOrganize/constants'
import { resolvePanelMemberIds } from '@/lib/autoOrganize/panels/resolveMembers'
import { createId } from '@/lib/ids'

import type { StateCreator } from 'zustand'
import type { CanvasState } from '../types'

export const createPanelsSlice: StateCreator<
  CanvasState,
  [],
  [],
  Partial<CanvasState>
> = (set, get) => ({
  selectCollectionWithPanel: (folderId) => {
    const s = get()
    // All folders under this collection (inclusive)
    const folderIds = new Set<string>([folderId])
    let grew = true
    while (grew) {
      grew = false
      for (const f of s.folders) {
        if (f.parentId && folderIds.has(f.parentId) && !folderIds.has(f.id)) {
          folderIds.add(f.id)
          grew = true
        }
      }
    }
    const members = s.items.filter(
      (i) => i.folderId != null && folderIds.has(i.folderId) && !i.hidden,
    )
    const cardIds = members.map((i) => i.id)
    const visibleMembers = members.length > 0 ? members : s.items.filter(
      (i) => i.folderId != null && folderIds.has(i.folderId),
    )
    const memberIds = (visibleMembers.length ? visibleMembers : members).map(
      (i) => i.id,
    )

    const prevPanels = s.canvas.layoutPanels ?? []
    let panels = [...prevPanels]
    let panelsChanged = false
    // Prefer a panel tagged with this exact folder id
    let panel = panels.find((p) => p.folderId === folderId)
    // Else a panel whose members are a subset of this collection
    if (!panel && memberIds.length > 0) {
      const memSet = new Set(memberIds)
      panel = panels.find(
        (p) =>
          (p.memberIds?.length ?? 0) > 0 &&
          p.memberIds!.every((id) => memSet.has(id)),
      )
    }

    // Summon a collection frame if none exists yet
    if (!panel && memberIds.length > 0) {
      const pack = s.items.filter((i) => memberIds.includes(i.id))
      const pad = s.lastAutoLayout?.panelPadding ?? 8
      const titleBand = 18
      const minX = Math.min(...pack.map((i) => i.x))
      const minY = Math.min(...pack.map((i) => i.y))
      const maxX = Math.max(...pack.map((i) => i.x + i.width))
      const maxY = Math.max(...pack.map((i) => i.y + i.height))
      const folder = s.folders.find((f) => f.id === folderId)
      const accentIdx = panels.length % LAYOUT_PANEL_ACCENTS.length
      panel = {
        id: createId('panel'),
        folderId,
        title: folder?.name?.trim() || 'Collection',
        showTitle: true,
        showStroke: true,
        x: Math.round(minX - pad),
        y: Math.round(minY - pad - titleBand),
        width: Math.max(80, Math.round(maxX - minX + pad * 2)),
        height: Math.max(48, Math.round(maxY - minY + pad * 2 + titleBand)),
        memberIds: [...memberIds],
        shape: 'rect',
        hierarchyLevel: 1,
        contentSort: 'none',
        accent: LAYOUT_PANEL_ACCENTS[accentIdx],
        zIndex: 0,
      }
      panels = [...panels, panel]
      panelsChanged = true
    } else if (panel && memberIds.length > 0) {
      // Refresh member list from current folder tree (stale after moves)
      const memSet = new Set(memberIds)
      const nextMembers = [
        ...new Set([
          ...(panel.memberIds ?? []).filter((id) => memSet.has(id)),
          ...memberIds,
        ]),
      ]
      const sameMembers =
        nextMembers.length === (panel.memberIds?.length ?? 0) &&
        nextMembers.every((id) => panel!.memberIds?.includes(id))
      const folderOk = panel.folderId === folderId || panel.folderId == null
      if (!sameMembers || !folderOk) {
        panel = {
          ...panel,
          memberIds: nextMembers,
          folderId: panel.folderId ?? folderId,
        }
        panels = panels.map((p) => (p.id === panel!.id ? panel! : p))
        panelsChanged = true
      }
    }

    set({
      dirty: panelsChanged ? true : s.dirty,
      canvas: panelsChanged
        ? { ...s.canvas, layoutPanels: panels }
        : s.canvas,
      selectedIds: cardIds.length > 0 ? cardIds : memberIds,
      selectedPanelIds: panel ? [panel.id] : [],
      selectedPanelId: panel?.id ?? null,
    })
  },

  removeLayoutPanels: (ids) => {
    if (ids.length === 0) return
    const drop = new Set(ids)
    set((s) => {
      const panels = s.canvas.layoutPanels ?? []
      const next = panels.filter((p) => !drop.has(p.id))
      if (next.length === panels.length) return s
      const nextSelectedPanelIds = s.selectedPanelIds.filter((id) => !drop.has(id))
      return {
        dirty: true,
        canvas: { ...s.canvas, layoutPanels: next },
        selectedPanelIds: nextSelectedPanelIds,
        selectedPanelId:
          nextSelectedPanelIds.length > 0
            ? nextSelectedPanelIds[nextSelectedPanelIds.length - 1]!
            : null,
      }
    })
  },

  updateLayoutPanel: (id, partial) =>
    set((s) => {
      const panels = s.canvas.layoutPanels ?? []
      const prev = panels.find((p) => p.id === id)
      if (!prev) return s
      const merged = { ...prev, ...partial }
      // showTitle → reflow (title band changes content top). contentSort is a
      // preference applied on Auto-layout inside panel (same as sheet groupSort
      // before Run) — do not shelf-repack on sort toggle alone.
      const needsRelayout = partial.showTitle !== undefined
      if (needsRelayout) {
        const { items, panel, panels: nextAll } = relayoutPanelContents(
          s.items,
          merged,
          {
            grid: s.canvas.gridSpacing ?? 24,
            panelPad: s.lastAutoLayout?.panelPadding ?? 4,
            allPanels: panels,
            mode: 'dense',
            blockGapPx: s.lastAutoLayout?.blockGap ?? 2,
            l2PanelGapPx:
              s.lastAutoLayout?.l2PanelGap ?? s.lastAutoLayout?.gap ?? 2,
            folders: s.folders?.map((f) => ({
              id: f.id,
              name: f.name,
              parentId: f.parentId,
            })),
          },
        )
        return {
          dirty: true,
          items,
          canvas: {
            ...s.canvas,
            layoutPanels: nextAll ?? panels.map((p) => (p.id === id ? panel : p)),
          },
        }
      }
      return {
        dirty: true,
        canvas: {
          ...s.canvas,
          layoutPanels: panels.map((p) => (p.id === id ? merged : p)),
        },
      }
    }),

  relayoutSelectedPanel: () =>
    set((s) => {
      const id = s.selectedPanelId
      if (!id) return s
      const panels = s.canvas.layoutPanels ?? []
      const panel = panels.find((p) => p.id === id)
      if (!panel) return s
      const { items, panel: nextPanel, panels: nextAll } = relayoutPanelContents(
        s.items,
        panel,
        {
          grid: s.canvas.gridSpacing ?? 24,
          gapPx: s.lastAutoLayout?.gap ?? 6,
          panelPad: s.lastAutoLayout?.panelPadding ?? 4,
          mode: 'shelf',
          allPanels: panels,
        },
      )
      return {
        items,
        dirty: true,
        canvas: {
          ...s.canvas,
          layoutPanels:
            nextAll ??
            panels.map((p) => (p.id === id ? nextPanel : p)),
        },
      }
    }),

  autoLayoutSelectedPanel: (shape, gaps) => {
    const s = get()
    const id = s.selectedPanelId
    if (!id) {
      return {
        ok: false,
        moved: 0,
        total: 0,
        reason: 'No panel selected — click a panel frame first',
      }
    }
    const panels = s.canvas.layoutPanels ?? []
    const panel = panels.find((p) => p.id === id)
    if (!panel) {
      return {
        ok: false,
        moved: 0,
        total: 0,
        reason: 'Selected panel not found (try sheet Auto-layout first)',
      }
    }

    // Recover members: folder-bound panels use live Layers assignment
    const memberIds = resolvePanelMemberIds(
      panel,
      s.items,
      panels,
      s.folders.map((f) => ({ id: f.id, parentId: f.parentId })),
    )
    if (memberIds.length === 0) {
      return {
        ok: false,
        moved: 0,
        total: 0,
        reason:
          'No cards in this panel — assign cards to a Layers folder or run sheet Auto-layout',
      }
    }

    const chromeShape =
      shape === 'polygon' || shape === 'rect'
        ? shape
        : panel.shape === 'polygon'
          ? 'polygon'
          : 'rect'
    const level = panel.hierarchyLevel ?? 1
    const l2 =
      gaps?.l2PanelGap !== undefined
        ? gaps.l2PanelGap
        : (s.lastAutoLayout?.l2PanelGap ?? s.lastAutoLayout?.gap ?? 2)
    const block =
      gaps?.blockGap !== undefined
        ? gaps.blockGap
        : (s.lastAutoLayout?.blockGap ?? 2)
    const l1 = s.lastAutoLayout?.l1PanelGap ?? s.lastAutoLayout?.gap ?? 2

    // Button click always densest free-flow into the current panel box.
    // (Group sort preference can be applied later; densest makes residual fill.)
    const panelForLayout = {
      ...panel,
      memberIds,
      contentSort: 'none' as const,
      shape: chromeShape,
    }

    let packedItems = s.items
    let nextPanel = panel
    let nextAll: typeof panels | undefined
    try {
      const result = relayoutPanelContents(s.items, panelForLayout, {
        grid: s.canvas.gridSpacing ?? 24,
        gapPx: Math.max(0, l1),
        l2PanelGapPx: Math.max(0, l2),
        blockGapPx: Math.max(0, block),
        panelPad: s.lastAutoLayout?.panelPadding ?? 4,
        mode: 'dense',
        forceFlat: true,
        allPanels: panels,
        panelShape: chromeShape,
        folders: s.folders?.map((f) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
        })),
      })
      packedItems = result.items
      nextPanel = { ...result.panel, memberIds }
      nextAll = result.panels
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[autoLayoutSelectedPanel] failed', e)
      return {
        ok: false,
        moved: 0,
        total: memberIds.length,
        reason: `Pack failed: ${msg}`,
      }
    }

    const memberSet = new Set(memberIds)
    const items = packedItems.map((it) =>
      memberSet.has(it.id)
        ? {
            ...it,
            contentFitKey: (it.contentFitKey ?? 0) + 1,
            autoFit: false,
          }
        : it,
    )
    const moved = items.filter((it) => {
      if (!memberSet.has(it.id)) return false
      const old = s.items.find((o) => o.id === it.id)
      if (!old) return true
      return (
        Math.abs(old.x - it.x) > 0.5 ||
        Math.abs(old.y - it.y) > 0.5 ||
        Math.abs(old.width - it.width) > 0.5 ||
        Math.abs(old.height - it.height) > 0.5
      )
    }).length

    // Residual empty inside pin: densest pack can leave margin when total
    // card area < frame (not a failure — cards keep fixed sizes).
    const memAfter = items.filter((i) => memberSet.has(i.id) && !i.hidden)
    let residualNote: string | undefined
    if (memAfter.length > 0) {
      const minX = Math.min(...memAfter.map((i) => i.x))
      const minY = Math.min(...memAfter.map((i) => i.y))
      const maxX = Math.max(...memAfter.map((i) => i.x + i.width))
      const maxY = Math.max(...memAfter.map((i) => i.y + i.height))
      const usedW = maxX - minX
      const usedH = maxY - minY
      const unusedW = Math.max(0, panel.width - usedW - 8)
      const unusedH = Math.max(0, panel.height - usedH - 24)
      if (unusedW > 48 || unusedH > 48) {
        // Log-only residual note — UI uses a success checkmark, not this text.
        residualNote =
          moved === 0
            ? `Densest pack for ${memberIds.length} cards — ~${Math.round(unusedW)}×${Math.round(unusedH)}px free in frame (content smaller than panel; card sizes fixed).`
            : `Packed ${moved} cards; ~${Math.round(unusedW)}×${Math.round(unusedH)}px free remains (fixed card sizes).`
      }
    }

    const prev = s.lastAutoLayout
    const lastAutoLayout = prev
      ? {
          ...prev,
          ...(level <= 1 ? { l2PanelGap: Math.max(0, l2) } : {}),
          blockGap: Math.max(0, block),
        }
      : {
          density: 'sm' as const,
          groupChrome: 'panels' as const,
          gap: Math.max(0, l1),
          l1PanelGap: Math.max(0, l1),
          l2PanelGap: Math.max(0, l2),
          blockGap: Math.max(0, block),
        }

    set({
      items,
      dirty: true,
      lastAutoLayout,
      canvas: {
        ...s.canvas,
        layoutPanels:
          nextAll?.map((p) =>
            p.id === id ? { ...nextPanel, memberIds } : p,
          ) ??
          panels.map((p) =>
            p.id === id ? { ...nextPanel, memberIds } : p,
          ),
      },
    })

    console.info(
      '[autoLayoutSelectedPanel]',
      id,
      `${moved}/${memberIds.length} cards moved`,
      `${nextPanel.width}×${nextPanel.height}`,
      chromeShape,
      residualNote ?? '',
    )

    return {
      ok: true,
      moved,
      total: memberIds.length,
      // Success reasons are optional diagnostics; UI shows a checkmark instead.
      reason: residualNote,
    }
  },

  moveLayoutPanelBy: (panelId, dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return
    set((s) => {
      const panels = s.canvas.layoutPanels ?? []
      if (!panels.some((p) => p.id === panelId)) return s
      const { items, panels: nextPanels } = translateLayoutPanelCluster(
        s.items,
        panels,
        panelId,
        dx,
        dy,
        {
          grid: s.canvas.gridSpacing ?? ORGANIZE_GRID,
          panelPad: s.lastAutoLayout?.panelPadding ?? 8,
        },
      )
      return {
        items,
        dirty: true,
        canvas: { ...s.canvas, layoutPanels: nextPanels },
      }
    })
  },

  resizeLayoutPanelTo: (panelId, geom) => {
    if (
      !Number.isFinite(geom.x) ||
      !Number.isFinite(geom.y) ||
      !Number.isFinite(geom.width) ||
      !Number.isFinite(geom.height)
    ) {
      return
    }
    set((s) => {
      const panels = s.canvas.layoutPanels ?? []
      if (!panels.some((p) => p.id === panelId)) return s
      const { items, panels: nextPanels } = resizeLayoutPanelCluster(
        s.items,
        panels,
        panelId,
        geom,
        {
          grid: s.canvas.gridSpacing ?? ORGANIZE_GRID,
          panelPad: s.lastAutoLayout?.panelPadding ?? 8,
        },
      )
      return {
        items,
        dirty: true,
        canvas: { ...s.canvas, layoutPanels: nextPanels },
      }
    })
  },
})
