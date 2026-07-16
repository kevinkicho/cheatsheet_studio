import { resyncLayoutPanelMembersFromFolders } from '@/lib/autoOrganize/panels/resolveMembers'
import { createId } from '@/lib/ids'
import type { CanvasItem } from '@/types'

import type { StateCreator } from 'zustand'
import type { CanvasState } from '../types'

export const createFoldersSlice: StateCreator<
  CanvasState,
  [],
  [],
  Partial<CanvasState>
> = (set, get) => ({
  setFolderHidden: (folderId, hidden) =>
    set((s) => {
      // Root (null): only direct ungrouped items. Folder: this folder + nested descendants.
      let folderIds: Set<string> | null = null
      if (folderId != null) {
        folderIds = new Set<string>([folderId])
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
      }
      return {
        items: s.items.map((i) => {
          const inFolder =
            folderId == null
              ? !i.folderId
              : Boolean(i.folderId && folderIds!.has(i.folderId))
          return inFolder ? { ...i, hidden } : i
        }),
        dirty: true,
      }
    }),

  setFolderLocked: (folderId, locked) =>
    set((s) => {
      let folderIds: Set<string> | null = null
      if (folderId != null) {
        folderIds = new Set<string>([folderId])
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
      }
      return {
        items: s.items.map((i) => {
          const inFolder =
            folderId == null
              ? !i.folderId
              : Boolean(i.folderId && folderIds!.has(i.folderId))
          return inFolder ? { ...i, locked } : i
        }),
        dirty: true,
      }
    }),

  addFolder: (name = 'Collection', parentId = null) => {
    const id = createId('folder')
    set((s) => {
      const order =
        s.folders.reduce((m, f) => Math.max(m, f.order ?? 0), 0) + 1
      let finalName = name
      let n = 1
      while (s.folders.some((f) => f.name === finalName)) {
        n += 1
        finalName = `${name} ${n}`
      }
      // Only nest under an existing parent
      const parent =
        parentId && s.folders.some((f) => f.id === parentId) ? parentId : null
      // Ensure parent is open so the new child is visible
      const folders = s.folders.map((f) =>
        parent && f.id === parent ? { ...f, open: true } : f,
      )
      return {
        folders: [
          ...folders,
          { id, name: finalName, open: true, order, parentId: parent },
        ],
        dirty: true,
      }
    })
    return id
  },

  renameFolder: (folderId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    set((s) => {
      const oldName = s.folders.find((f) => f.id === folderId)?.name?.trim()
      const panels = s.canvas.layoutPanels ?? []
      // Keep canvas panel title chips in sync with the Layers collection name.
      // Match by folderId, or by legacy panels that only share the old title.
      const nextPanels = panels.map((p) => {
        if (p.folderId === folderId) {
          return { ...p, title: trimmed }
        }
        if (
          !p.folderId &&
          oldName &&
          (p.title ?? '').trim() === oldName
        ) {
          return { ...p, title: trimmed, folderId }
        }
        return p
      })
      const panelsChanged = nextPanels.some(
        (p, i) =>
          p.title !== panels[i]?.title || p.folderId !== panels[i]?.folderId,
      )
      return {
        folders: s.folders.map((f) =>
          f.id === folderId ? { ...f, name: trimmed } : f,
        ),
        dirty: true,
        canvas: panelsChanged
          ? { ...s.canvas, layoutPanels: nextPanels }
          : s.canvas,
      }
    })
  },

  toggleFolderOpen: (folderId) =>
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === folderId ? { ...f, open: f.open === false } : f,
      ),
      dirty: true,
    })),

  deleteFolder: (folderId, opts) =>
    set((s) => {
      // Collect this folder + all descendants
      const toRemove = new Set<string>()
      const walk = (id: string) => {
        toRemove.add(id)
        for (const f of s.folders) {
          if (f.parentId === id) walk(f.id)
        }
      }
      walk(folderId)

      if (opts?.deleteItems) {
        return {
          folders: s.folders.filter((f) => !toRemove.has(f.id)),
          items: s.items.filter(
            (i) => !i.folderId || !toRemove.has(i.folderId),
          ),
          selectedIds: s.selectedIds.filter((id) => {
            const it = s.items.find((i) => i.id === id)
            return !it || !it.folderId || !toRemove.has(it.folderId)
          }),
          dirty: true,
        }
      }

      // Keep items & child folders: promote one level (to parent of deleted).
      // Preserve layering: item z-order and sibling collection order.
      const deleted = s.folders.find((f) => f.id === folderId)
      if (!deleted) return s
      const promoteTo = deleted.parentId ?? null

      // —— Child collections: keep their relative order, insert where deleted sat ——
      const childFolders = s.folders
        .filter((f) => f.parentId === folderId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

      const siblingsAtDest = s.folders
        .filter((f) => (f.parentId ?? null) === promoteTo)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

      const deletedIdx = siblingsAtDest.findIndex((f) => f.id === folderId)
      const insertAt = deletedIdx >= 0 ? deletedIdx : siblingsAtDest.length
      const before = siblingsAtDest.slice(0, insertAt).filter((f) => f.id !== folderId)
      const after = siblingsAtDest.slice(insertAt + (deletedIdx >= 0 ? 1 : 0))
      // New sibling sequence at promoteTo: before | promoted children | after
      const destFolderSequence = [...before, ...childFolders, ...after]
      const folderOrderMap = new Map<string, number>()
      destFolderSequence.forEach((f, i) => folderOrderMap.set(f.id, i + 1))

      const folders = s.folders
        .filter((f) => f.id !== folderId)
        .map((f) => {
          if (f.parentId === folderId) {
            return {
              ...f,
              parentId: promoteTo,
              order: folderOrderMap.get(f.id) ?? f.order,
            }
          }
          if ((f.parentId ?? null) === promoteTo && folderOrderMap.has(f.id)) {
            return { ...f, order: folderOrderMap.get(f.id) }
          }
          return f
        })

      // —— Items: keep canvas layering (zIndex) exactly as-is ——
      // Only reparent. Relative stack order among the folder’s cards (and vs
      // every other card on the sheet) is therefore unchanged.
      // If any promoted cards share a zIndex, break ties with a stable sort
      // and give them consecutive unique z so outliner order stays deterministic.
      const promoted = s.items
        .filter((i) => i.folderId === folderId)
        .sort((a, b) => {
          if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex
          return a.id.localeCompare(b.id)
        })

      const hasZTies =
        promoted.length > 1 &&
        promoted.some((p, i) => i > 0 && p.zIndex === promoted[i - 1]!.zIndex)

      let items = s.items.map((i) =>
        i.folderId === folderId ? { ...i, folderId: promoteTo } : i,
      )
      let maxZ = s.maxZ

      if (hasZTies && promoted.length > 0) {
        // Strictly increasing z in the same relative order
        const zAssign = new Map<string, number>()
        let z = promoted[0]!.zIndex
        for (const it of promoted) {
          zAssign.set(it.id, z)
          z += 1
        }
        maxZ = Math.max(maxZ, z - 1)
        items = items.map((i) =>
          zAssign.has(i.id) ? { ...i, zIndex: zAssign.get(i.id)! } : i,
        )
      }

      return {
        folders,
        items,
        maxZ,
        dirty: true,
      }
    }),

  moveItemsToFolder: (itemIds, folderId) => {
    if (itemIds.length === 0) return
    const idSet = new Set(itemIds)
    set((s) => {
      const items = s.items.map((i) =>
        idSet.has(i.id) ? { ...i, folderId: folderId } : i,
      )
      const panels = s.canvas.layoutPanels ?? []
      const nextPanels = resyncLayoutPanelMembersFromFolders(
        panels,
        items,
        s.folders.map((f) => ({ id: f.id, parentId: f.parentId })),
      )
      return {
        items,
        dirty: true,
        canvas:
          nextPanels === panels
            ? s.canvas
            : { ...s.canvas, layoutPanels: nextPanels },
      }
    })
  },

  placeItemsAbove: (targetId, draggedIds) => {
    get().placeItemsRelative(draggedIds, targetId, 'before')
  },

  placeItemsRelative: (itemIds, targetItemId, position) => {
    const unique = [...new Set(itemIds)].filter((id) => id !== targetItemId)
    if (unique.length === 0) return
    set((s) => {
      const target = s.items.find((i) => i.id === targetItemId)
      if (!target) return s
      const folderId = target.folderId ?? null
      const idSet = new Set(unique)

      // Sibling items in same folder after move (excluding dragged), high z first
      const siblings = s.items
        .filter(
          (i) =>
            (i.folderId ?? null) === folderId &&
            !idSet.has(i.id) &&
            i.id !== targetItemId,
        )
        .sort((a, b) => b.zIndex - a.zIndex)

      // Outliner list order (top → bottom): higher z first
      // before target → insert immediately above target in list
      // after target → insert immediately below target in list
      const above = siblings.filter((i) => i.zIndex > target.zIndex)
      const below = siblings.filter((i) => i.zIndex < target.zIndex)

      const dragged = unique
        .map((id) => s.items.find((i) => i.id === id))
        .filter(Boolean) as CanvasItem[]
      dragged.sort((a, b) => b.zIndex - a.zIndex)

      const sequence: CanvasItem[] =
        position === 'before'
          ? [...above, ...dragged, target, ...below]
          : [...above, target, ...dragged, ...below]

      // Assign descending z so list order is preserved
      const base = Math.max(s.maxZ, sequence.length) + sequence.length
      const zAssign = new Map<string, number>()
      sequence.forEach((it, idx) => {
        zAssign.set(it.id, base - idx)
      })

      const items = s.items.map((i) => {
        if (i.id === targetItemId) {
          return {
            ...i,
            zIndex: zAssign.get(i.id) ?? i.zIndex,
          }
        }
        if (!idSet.has(i.id)) {
          const z = zAssign.get(i.id)
          return z != null ? { ...i, zIndex: z } : i
        }
        return {
          ...i,
          folderId,
          zIndex: zAssign.get(i.id) ?? i.zIndex,
        }
      })
      const panels = s.canvas.layoutPanels ?? []
      const nextPanels = resyncLayoutPanelMembersFromFolders(
        panels,
        items,
        s.folders.map((f) => ({ id: f.id, parentId: f.parentId })),
      )
      return {
        items,
        maxZ: Math.max(s.maxZ, base),
        dirty: true,
        canvas:
          nextPanels === panels
            ? s.canvas
            : { ...s.canvas, layoutPanels: nextPanels },
      }
    })
  },

  placeItemsInFolderAt: (itemIds, folderId, edge) => {
    const unique = [...new Set(itemIds)]
    if (unique.length === 0) return
    set((s) => {
      const idSet = new Set(unique)
      const others = s.items
        .filter(
          (i) =>
            (i.folderId ?? null) === folderId && !idSet.has(i.id),
        )
        .sort((a, b) => b.zIndex - a.zIndex)

      const dragged = unique
        .map((id) => s.items.find((i) => i.id === id))
        .filter(Boolean) as CanvasItem[]
      dragged.sort((a, b) => b.zIndex - a.zIndex)

      const sequence =
        edge === 'front' ? [...dragged, ...others] : [...others, ...dragged]

      const base = Math.max(s.maxZ, sequence.length) + sequence.length
      const zAssign = new Map<string, number>()
      sequence.forEach((it, idx) => {
        zAssign.set(it.id, base - idx)
      })

      const items = s.items.map((i) => {
        if (!idSet.has(i.id) && !zAssign.has(i.id)) return i
        if (idSet.has(i.id)) {
          return {
            ...i,
            folderId,
            zIndex: zAssign.get(i.id) ?? i.zIndex,
          }
        }
        return { ...i, zIndex: zAssign.get(i.id) ?? i.zIndex }
      })
      const panels = s.canvas.layoutPanels ?? []
      const nextPanels = resyncLayoutPanelMembersFromFolders(
        panels,
        items,
        s.folders.map((f) => ({ id: f.id, parentId: f.parentId })),
      )
      return {
        items,
        maxZ: Math.max(s.maxZ, base),
        dirty: true,
        canvas:
          nextPanels === panels
            ? s.canvas
            : { ...s.canvas, layoutPanels: nextPanels },
      }
    })
  },

  moveFolder: (folderId, parentId) => {
    // Append at end of new parent's children
    get().placeFolderAmong(folderId, parentId, null)
  },

  placeFolderAmong: (folderId, parentId, beforeFolderId) => {
    if (folderId === parentId) return
    if (beforeFolderId === folderId) return
    set((s) => {
      // Reject cycles
      if (parentId) {
        const descendants = new Set<string>()
        const walk = (id: string) => {
          descendants.add(id)
          for (const f of s.folders) {
            if (f.parentId === id) walk(f.id)
          }
        }
        walk(folderId)
        if (descendants.has(parentId)) return s
        if (!s.folders.some((f) => f.id === parentId)) return s
      }

      // Sibling folders under parentId, excluding the one being moved
      const siblings = s.folders
        .filter(
          (f) =>
            f.id !== folderId && (f.parentId ?? null) === (parentId ?? null),
        )
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

      const next: OutlinerFolder[] = []
      let inserted = false
      for (const sib of siblings) {
        if (beforeFolderId && sib.id === beforeFolderId) {
          next.push({
            id: folderId,
            name: '',
            order: 0,
            parentId: parentId ?? null,
          } as OutlinerFolder)
          inserted = true
        }
        next.push(sib)
      }
      if (!inserted) {
        // Append (or beforeFolderId not found)
        next.push({
          id: folderId,
          name: '',
          order: 0,
          parentId: parentId ?? null,
        } as OutlinerFolder)
      }

      // Build order map for all siblings including moved
      const orderMap = new Map<string, number>()
      next.forEach((f, idx) => {
        orderMap.set(f.id, idx + 1)
      })

      return {
        folders: s.folders.map((f) => {
          if (f.id === folderId) {
            return {
              ...f,
              parentId: parentId ?? null,
              order: orderMap.get(f.id) ?? f.order,
            }
          }
          if (orderMap.has(f.id)) {
            return { ...f, order: orderMap.get(f.id) }
          }
          // Open destination parent
          if (parentId && f.id === parentId) {
            return { ...f, open: true }
          }
          return f
        }),
        dirty: true,
      }
    })
  },
})
