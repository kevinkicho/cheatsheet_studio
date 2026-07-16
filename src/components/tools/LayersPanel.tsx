import {
  useMemo,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Code2,
  Eye,
  EyeOff,
  FolderPlus,
  GitBranch,
  Grid3x3,
  ImageIcon,
  LineChart,
  List,
  Lock,
  LockOpen,
  MessageSquare,
  Pencil,
  Pi,
  Search,
  Sigma,
  Table2,
  Trash2,
} from 'lucide-react'
import type { CanvasItem, OutlinerFolder } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import { useUiStore } from '@/stores/uiStore'

/**
 * Fine-grained drop slot for slide-between reordering:
 * - `into`  — nest inside a collection (or sheet root)
 * - `line`  — insert before/after a specific row (folder or item)
 */
type DropSlot =
  | { mode: 'into'; parentId: string | null }
  | {
      mode: 'line'
      row: 'folder' | 'item'
      id: string
      edge: 'before' | 'after'
    }

type DragPayload =
  | { kind: 'items'; ids: string[] }
  | { kind: 'folder'; folderId: string }

const DND_TYPE = 'application/x-cheatsheet-outliner'

/**
 * Blender-style Outliner: multi-select, nested collections, and
 * drag-to-slide between rows (folder order + item z-order).
 */
export function LayersPanel() {
  const items = useCanvasStore((s) => s.items)
  const folders = useCanvasStore((s) => s.folders)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const select = useCanvasStore((s) => s.select)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds)
  const selectCollectionWithPanel = useCanvasStore(
    (s) => s.selectCollectionWithPanel,
  )
  const requestFocusCanvasItem = useUiStore((s) => s.requestFocusCanvasItem)
  const canvasShowHiddenItems = useUiStore((s) => s.canvasShowHiddenItems)
  const toggleCanvasShowHiddenItems = useUiStore(
    (s) => s.toggleCanvasShowHiddenItems,
  )
  const bringForward = useCanvasStore((s) => s.bringForward)
  const sendBackward = useCanvasStore((s) => s.sendBackward)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const sendToBack = useCanvasStore((s) => s.sendToBack)
  const removeItems = useCanvasStore((s) => s.removeItems)
  const toggleItemHidden = useCanvasStore((s) => s.toggleItemHidden)
  const toggleItemLocked = useCanvasStore((s) => s.toggleItemLocked)
  const setFolderHidden = useCanvasStore((s) => s.setFolderHidden)
  const setFolderLocked = useCanvasStore((s) => s.setFolderLocked)
  const addFolder = useCanvasStore((s) => s.addFolder)
  const renameFolder = useCanvasStore((s) => s.renameFolder)
  const toggleFolderOpen = useCanvasStore((s) => s.toggleFolderOpen)
  const deleteFolder = useCanvasStore((s) => s.deleteFolder)
  const placeItemsRelative = useCanvasStore((s) => s.placeItemsRelative)
  const placeItemsInFolderAt = useCanvasStore((s) => s.placeItemsInFolderAt)
  const placeFolderAmong = useCanvasStore((s) => s.placeFolderAmong)
  const updateItems = useCanvasStore((s) => s.updateItems)
  const title = useCanvasStore((s) => s.title)

  const [filter, setFilter] = useState('')
  const [rootOpen, setRootOpen] = useState(true)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null)
  const [dropSlot, setDropSlot] = useState<DropSlot | null>(null)

  const q = filter.trim().toLowerCase()

  const matchesFilter = (i: CanvasItem) => {
    if (!q) return true
    return (
      (i.title ?? '').toLowerCase().includes(q) ||
      i.type.toLowerCase().includes(q)
    )
  }

  const childFoldersOf = useMemo(() => {
    const map = new Map<string | null, OutlinerFolder[]>()
    map.set(null, [])
    for (const f of folders) {
      const p = f.parentId ?? null
      if (!map.has(p)) map.set(p, [])
      map.get(p)!.push(f)
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
    return map
  }, [folders])

  const itemsByFolder = useMemo(() => {
    const map = new Map<string | null, CanvasItem[]>()
    map.set(null, [])
    for (const f of folders) map.set(f.id, [])
    for (const i of items) {
      if (!matchesFilter(i)) continue
      const fid = i.folderId ?? null
      if (fid != null && !map.has(fid)) {
        map.get(null)!.push(i)
        continue
      }
      if (!map.has(fid)) map.set(fid, [])
      map.get(fid)!.push(i)
    }
    for (const [, list] of map) {
      list.sort((a, b) => b.zIndex - a.zIndex)
    }
    return map
  }, [items, folders, q])

  const descendantFolderIds = (folderId: string): Set<string> => {
    const out = new Set<string>()
    const walk = (id: string) => {
      out.add(id)
      for (const f of folders) {
        if ((f.parentId ?? null) === id) walk(f.id)
      }
    }
    walk(folderId)
    return out
  }

  const itemsInFolderTree = (folderId: string | null): CanvasItem[] => {
    if (folderId == null) {
      return items.filter((i) => !i.folderId)
    }
    const ids = descendantFolderIds(folderId)
    return items.filter((i) => i.folderId && ids.has(i.folderId))
  }

  const primaryId = selectedIds[selectedIds.length - 1]
  const hasSelection = selectedIds.length > 0
  const multiSelect = selectedIds.length > 1

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.includes(i.id)),
    [items, selectedIds],
  )

  /** Mass eye/lock for current selection (header + multi row actions). */
  const selectionRestrict = useMemo(() => {
    if (selectedItems.length === 0) {
      return { empty: true, allHidden: false, allLocked: false, count: 0 }
    }
    return {
      empty: false,
      count: selectedItems.length,
      allHidden: selectedItems.every((i) => i.hidden === true),
      allLocked: selectedItems.every((i) => i.locked === true),
    }
  }, [selectedItems])

  const toggleSelectionHidden = () => {
    if (selectedIds.length === 0) return
    // If every selected is hidden → show all; otherwise hide all
    updateItems(selectedIds, { hidden: !selectionRestrict.allHidden })
  }

  const toggleSelectionLocked = () => {
    if (selectedIds.length === 0) return
    updateItems(selectedIds, { locked: !selectionRestrict.allLocked })
  }

  /** Eye/lock on a row: if multi-selected and this row is in the set, apply to all. */
  const toggleHiddenForRow = (itemId: string) => {
    if (multiSelect && selectedIds.includes(itemId)) {
      toggleSelectionHidden()
      return
    }
    toggleItemHidden(itemId)
  }

  const toggleLockedForRow = (itemId: string) => {
    if (multiSelect && selectedIds.includes(itemId)) {
      toggleSelectionLocked()
      return
    }
    toggleItemLocked(itemId)
  }

  const folderVisibility = (folderId: string | null) => {
    const list = itemsInFolderTree(folderId)
    if (list.length === 0)
      return { allHidden: false, allLocked: false, empty: true }
    return {
      empty: false,
      allHidden: list.every((i) => i.hidden === true),
      allLocked: list.every((i) => i.locked === true),
    }
  }

  const selectFolderContents = (folderId: string | null) => {
    // Sheet root: cards only (no collection panel)
    if (folderId == null) {
      setSelectedIds(itemsInFolderTree(null).map((i) => i.id))
      return
    }
    // Collection: select all cards in the tree + panel frame (create if needed)
    // so left sidebar opens Panel properties / Auto-layout inside panel.
    selectCollectionWithPanel(folderId)
  }

  const startRename = (f: OutlinerFolder) => {
    setRenamingId(f.id)
    setRenameDraft(f.name)
  }

  const commitRename = () => {
    if (renamingId && renameDraft.trim()) {
      renameFolder(renamingId, renameDraft.trim())
    }
    setRenamingId(null)
    setRenameDraft('')
  }

  const onRenameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
    }
    if (e.key === 'Escape') {
      setRenamingId(null)
      setRenameDraft('')
    }
  }

  // ── Drag payload ──────────────────────────────────────────────
  const writePayload = (e: DragEvent, payload: DragPayload) => {
    setDragPayload(payload)
    e.dataTransfer.setData(DND_TYPE, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'move'
  }

  const parsePayload = (e: DragEvent): DragPayload | null => {
    try {
      const raw = e.dataTransfer.getData(DND_TYPE)
      if (raw) return JSON.parse(raw) as DragPayload
    } catch {
      /* ignore */
    }
    return dragPayload
  }

  const beginDragItems = (e: DragEvent, itemId: string) => {
    const state = useCanvasStore.getState()
    const ids =
      state.selectedIds.includes(itemId) && state.selectedIds.length > 1
        ? [...state.selectedIds]
        : [itemId]
    const movable = ids.filter((id) => {
      const it = state.items.find((i) => i.id === id)
      return it && !it.locked
    })
    if (movable.length === 0) {
      e.preventDefault()
      return
    }
    writePayload(e, { kind: 'items', ids: movable })
    if (!state.selectedIds.includes(itemId)) select(itemId)
  }

  const beginDragFolder = (e: DragEvent, folderId: string) => {
    e.stopPropagation()
    writePayload(e, { kind: 'folder', folderId })
  }

  // ── Slot resolution ───────────────────────────────────────────
  /** Parent a line-slot would place into (folder id or null = root). */
  const lineParent = (slot: Extract<DropSlot, { mode: 'line' }>): string | null => {
    if (slot.row === 'folder') {
      return folders.find((f) => f.id === slot.id)?.parentId ?? null
    }
    return items.find((i) => i.id === slot.id)?.folderId ?? null
  }

  /**
   * For folder reordering among sibling folders: which folder to insert before.
   * null = append at end of that parent’s folder list.
   */
  const resolveBeforeFolderId = (
    slot: DropSlot,
  ): { parentId: string | null; beforeFolderId: string | null } | null => {
    if (slot.mode === 'into') {
      return { parentId: slot.parentId, beforeFolderId: null }
    }
    if (slot.row === 'folder') {
      const parentId = folders.find((f) => f.id === slot.id)?.parentId ?? null
      const siblings = childFoldersOf.get(parentId) ?? []
      if (slot.edge === 'before') {
        return { parentId, beforeFolderId: slot.id }
      }
      // after this folder → before the next sibling, or append
      const idx = siblings.findIndex((f) => f.id === slot.id)
      const next = idx >= 0 ? siblings[idx + 1] : undefined
      return { parentId, beforeFolderId: next?.id ?? null }
    }
    // Line on an item: join that item’s parent as a folder sibling at end
    // (before first item visually = after all folders)
    if (slot.edge === 'before') {
      // place folder at end of folders under this parent (already "before" items)
      return { parentId: lineParent(slot), beforeFolderId: null }
    }
    return { parentId: lineParent(slot), beforeFolderId: null }
  }

  const isValidSlot = (
    payload: DragPayload | null,
    slot: DropSlot,
  ): boolean => {
    if (!payload) return false

    if (payload.kind === 'folder') {
      const fid = payload.folderId
      const blocked = descendantFolderIds(fid)

      if (slot.mode === 'into') {
        if (slot.parentId != null && blocked.has(slot.parentId)) return false
        // Always allow "into" even if already child (re-append / no-op OK to highlight lightly)
        return slot.parentId !== fid
      }

      // Cannot drop relative to self
      if (slot.row === 'folder' && slot.id === fid) return false
      // Cannot drop relative to a descendant folder row
      if (slot.row === 'folder' && blocked.has(slot.id)) return false

      const dest = resolveBeforeFolderId(slot)
      if (!dest) return false
      if (dest.parentId != null && blocked.has(dest.parentId)) return false
      return true
    }

    // Items
    if (payload.ids.length === 0) return false
    if (slot.mode === 'line' && slot.row === 'item') {
      // Don't land on a pure self-reference with single selection
      if (payload.ids.length === 1 && payload.ids[0] === slot.id) return false
    }
    return true
  }

  /** Y-ratio within row → before / into / after */
  const slotFromPointer = (
    e: DragEvent,
    row: 'folder' | 'item' | 'root',
    id: string | null,
  ): DropSlot | null => {
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    const ratio =
      rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5

    if (row === 'root') {
      // Root header: top half = into root; bottom half still into root
      return { mode: 'into', parentId: null }
    }

    if (row === 'folder' && id) {
      // Top 28% = line before, bottom 28% = line after, middle = nest into
      if (ratio < 0.28) return { mode: 'line', row: 'folder', id, edge: 'before' }
      if (ratio > 0.72) return { mode: 'line', row: 'folder', id, edge: 'after' }
      return { mode: 'into', parentId: id }
    }

    if (row === 'item' && id) {
      if (ratio < 0.5) return { mode: 'line', row: 'item', id, edge: 'before' }
      return { mode: 'line', row: 'item', id, edge: 'after' }
    }
    return null
  }

  const allowDropOn = (
    e: DragEvent,
    row: 'folder' | 'item' | 'root',
    id: string | null,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const payload = dragPayload ?? parsePayload(e)
    const slot = slotFromPointer(e, row, id)
    if (!slot || !isValidSlot(payload, slot)) {
      e.dataTransfer.dropEffect = 'none'
      setDropSlot(null)
      return
    }
    e.dataTransfer.dropEffect = 'move'
    setDropSlot(slot)
  }

  const clearDrop = () => setDropSlot(null)

  const finishDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const payload = parsePayload(e)
    const slot = dropSlot
    setDragPayload(null)
    setDropSlot(null)
    if (!payload || !slot || !isValidSlot(payload, slot)) return
    applyDrop(payload, slot)
  }

  const applyDrop = (payload: DragPayload, slot: DropSlot) => {
    if (payload.kind === 'folder') {
      const dest = resolveBeforeFolderId(slot)
      if (!dest) return
      placeFolderAmong(payload.folderId, dest.parentId, dest.beforeFolderId)
      return
    }

    const ids = payload.ids
    if (ids.length === 0) return

    if (slot.mode === 'into') {
      placeItemsInFolderAt(ids, slot.parentId, 'front')
      return
    }

    if (slot.row === 'item') {
      placeItemsRelative(ids, slot.id, slot.edge)
      return
    }

    // Line relative to a folder row → join that folder’s parent (or nest after)
    if (slot.row === 'folder') {
      if (slot.edge === 'before') {
        // Items land in the same parent as the folder, at the front of items list
        const parentId =
          folders.find((f) => f.id === slot.id)?.parentId ?? null
        placeItemsInFolderAt(ids, parentId, 'front')
      } else {
        // After folder row: nest into that folder at front (common “drop below header” feel)
        // Actually for slide-between: after a folder among siblings means same parent at end of items
        // Better: into that folder at front when dropping "after" the collection header while open feels wrong
        // Use same parent as folder, back of items
        const parentId =
          folders.find((f) => f.id === slot.id)?.parentId ?? null
        placeItemsInFolderAt(ids, parentId, 'back')
      }
    }
  }

  // ── Drop indicator helpers ────────────────────────────────────
  const isLine = (
    row: 'folder' | 'item',
    id: string,
    edge: 'before' | 'after',
  ) =>
    dropSlot?.mode === 'line' &&
    dropSlot.row === row &&
    dropSlot.id === id &&
    dropSlot.edge === edge

  const isInto = (parentId: string | null) =>
    dropSlot?.mode === 'into' && dropSlot.parentId === parentId

  const draggingFolderId =
    dragPayload?.kind === 'folder' ? dragPayload.folderId : null
  const draggingItemIds =
    dragPayload?.kind === 'items' ? dragPayload.ids : null

  // ── Render tree ───────────────────────────────────────────────
  const renderFolderBranch = (folder: OutlinerFolder, depth: number) => {
    const children = itemsByFolder.get(folder.id) ?? []
    const nested = childFoldersOf.get(folder.id) ?? []
    const open = folder.open !== false
    const vis = folderVisibility(folder.id)
    const count = children.length + nested.length
    const isDragging = draggingFolderId === folder.id

    return (
      <div key={folder.id} className={isDragging ? 'opacity-40' : undefined}>
        <div className="relative">
          {isLine('folder', folder.id, 'before') && (
            <InsertLine depth={depth} edge="before" />
          )}
          <FolderHeaderRow
            name={folder.name}
            open={open}
            count={count}
            depth={depth}
            isRoot={false}
            vis={vis}
            intoActive={isInto(folder.id)}
            renaming={renamingId === folder.id}
            renameDraft={renameDraft}
            onRenameDraft={setRenameDraft}
            onRenameKey={onRenameKey}
            onRenameBlur={commitRename}
            onToggleOpen={() => toggleFolderOpen(folder.id)}
            onSelectFolder={() => {
              if (folder.open === false) toggleFolderOpen(folder.id)
              selectFolderContents(folder.id)
            }}
            onToggleHidden={() => {
              if (vis.empty) return
              setFolderHidden(folder.id, !vis.allHidden)
            }}
            onToggleLocked={() => {
              if (vis.empty) return
              setFolderLocked(folder.id, !vis.allLocked)
            }}
            onStartRename={() => startRename(folder)}
            onDelete={() => {
              if (
                window.confirm(
                  `Delete folder “${folder.name}”? Nested folders promote one level (order kept); items stay on the sheet with the same layering (z-order).`,
                )
              ) {
                deleteFolder(folder.id)
              }
            }}
            onAddNested={() => {
              const id = addFolder('Collection', folder.id)
              if (folder.open === false) toggleFolderOpen(folder.id)
              setRenamingId(id)
              setRenameDraft('Collection')
            }}
            draggable
            onDragStart={(e) => beginDragFolder(e, folder.id)}
            onDragOver={(e) => allowDropOn(e, 'folder', folder.id)}
            onDragLeave={clearDrop}
            onDrop={finishDrop}
          />
          {isLine('folder', folder.id, 'after') && (
            <InsertLine depth={depth} edge="after" />
          )}
        </div>

        {open && (
          <>
            {nested.map((child) => renderFolderBranch(child, depth + 1))}
            {children.map((item) => (
              <div key={item.id} className="relative">
                {isLine('item', item.id, 'before') && (
                  <InsertLine depth={depth + 1} edge="before" />
                )}
                <OutlinerRow
                  item={item}
                  depth={depth + 1}
                  selected={selectedIds.includes(item.id)}
                  dragging={draggingItemIds?.includes(item.id) ?? false}
                  onSelect={(e) => {
                    if (e.shiftKey) toggleSelect(item.id)
                    else {
                      select(item.id)
                      requestFocusCanvasItem(item.id)
                    }
                  }}
                  onToggleHidden={() => toggleHiddenForRow(item.id)}
                  onToggleLocked={() => toggleLockedForRow(item.id)}
                  onDragStart={(e) => beginDragItems(e, item.id)}
                  onDragOver={(e) => allowDropOn(e, 'item', item.id)}
                  onDragLeave={clearDrop}
                  onDrop={finishDrop}
                />
                {isLine('item', item.id, 'after') && (
                  <InsertLine depth={depth + 1} edge="after" />
                )}
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  const rootItems = itemsByFolder.get(null) ?? []
  const topFolders = childFoldersOf.get(null) ?? []
  const rootVis = folderVisibility(null)

  return (
    <div className="flex h-full flex-col bg-[#1d1d1d] text-[11px] text-[#c0c0c0]">
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-[#0a0a0a] bg-[#2b2b2b] px-1.5">
        <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#e0e0e0]">
          Outliner
        </span>
        <button
          type="button"
          title="New folder (top-level)"
          onClick={() => {
            const id = addFolder('Collection')
            setRenamingId(id)
            setRenameDraft('Collection')
          }}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-[#aaa] hover:bg-[#3a3a3a] hover:text-white"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
        <span className="pr-1 tabular-nums text-[10px] text-[#777]">
          {items.length}
        </span>
      </div>

      <div className="flex shrink-0 flex-col gap-1 border-b border-[#0a0a0a] bg-[#232323] px-2 py-1">
        <div className="flex items-center gap-1.5">
          <Search className="h-3 w-3 shrink-0 text-[#666]" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-[#ddd] outline-none placeholder:text-[#555]"
          />
        </div>
        <label
          className="flex cursor-pointer items-center gap-1.5 text-[10px] text-[#999] hover:text-[#ccc]"
          title="When checked, hidden cards still appear dimmed on the board"
        >
          <input
            type="checkbox"
            checked={canvasShowHiddenItems}
            onChange={() => toggleCanvasShowHiddenItems()}
            className="rounded border-zinc-600"
          />
          Show hidden on canvas
        </label>
      </div>

      <div className="flex shrink-0 items-center border-b border-[#0a0a0a] bg-[#262626] pr-1 text-[9px] text-[#666]">
        <div className="min-w-0 flex-1 px-1 py-0.5">
          Name
          {multiSelect && (
            <span className="ml-1.5 font-normal tabular-nums text-[#6a9fd4]">
              · {selectedIds.length} selected
            </span>
          )}
        </div>
        <div className="flex w-[72px] shrink-0 justify-end gap-0.5 pr-0.5">
          <button
            type="button"
            disabled={!hasSelection}
            title={
              !hasSelection
                ? 'Select items, then click to hide/show all selected'
                : selectionRestrict.allHidden
                  ? `Show ${selectionRestrict.count} selected`
                  : `Hide ${selectionRestrict.count} selected`
            }
            onClick={toggleSelectionHidden}
            className={`flex h-5 w-5 items-center justify-center rounded-sm transition ${
              !hasSelection
                ? 'cursor-default text-[#555]'
                : selectionRestrict.allHidden
                  ? 'text-[#e07070] hover:bg-black/30 hover:text-[#f09090]'
                  : 'text-[#aaa] hover:bg-black/30 hover:text-white'
            }`}
          >
            {hasSelection && selectionRestrict.allHidden ? (
              <EyeOff className="h-3 w-3" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            disabled={!hasSelection}
            title={
              !hasSelection
                ? 'Select items, then click to lock/unlock all selected'
                : selectionRestrict.allLocked
                  ? `Unlock ${selectionRestrict.count} selected`
                  : `Lock ${selectionRestrict.count} selected`
            }
            onClick={toggleSelectionLocked}
            className={`flex h-5 w-5 items-center justify-center rounded-sm transition ${
              !hasSelection
                ? 'cursor-default text-[#555]'
                : selectionRestrict.allLocked
                  ? 'text-[#e07070] hover:bg-black/30 hover:text-[#f09090]'
                  : 'text-[#aaa] hover:bg-black/30 hover:text-white'
            }`}
          >
            {hasSelection && selectionRestrict.allLocked ? (
              <Lock className="h-3 w-3" />
            ) : (
              <LockOpen className="h-3 w-3 opacity-70" />
            )}
          </button>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onDragEnd={() => {
          setDragPayload(null)
          setDropSlot(null)
        }}
      >
        <div className="relative">
          <FolderHeaderRow
            name={title || 'Sheet Collection'}
            open={rootOpen}
            count={rootItems.length + topFolders.length}
            depth={0}
            isRoot
            vis={rootVis}
            intoActive={isInto(null)}
            onToggleOpen={() => setRootOpen((o) => !o)}
            onSelectFolder={() => selectFolderContents(null)}
            onToggleHidden={() => {
              if (rootVis.empty) return
              setFolderHidden(null, !rootVis.allHidden)
            }}
            onToggleLocked={() => {
              if (rootVis.empty) return
              setFolderLocked(null, !rootVis.allLocked)
            }}
            onDragOver={(e) => allowDropOn(e, 'root', null)}
            onDragLeave={clearDrop}
            onDrop={finishDrop}
          />
        </div>

        {rootOpen && (
          <>
            {topFolders.map((folder) => renderFolderBranch(folder, 1))}
            {rootItems.map((item) => (
              <div key={item.id} className="relative">
                {isLine('item', item.id, 'before') && (
                  <InsertLine depth={1} edge="before" />
                )}
                <OutlinerRow
                  item={item}
                  depth={1}
                  selected={selectedIds.includes(item.id)}
                  dragging={draggingItemIds?.includes(item.id) ?? false}
                  onSelect={(e) => {
                    if (e.shiftKey) toggleSelect(item.id)
                    else {
                      select(item.id)
                      requestFocusCanvasItem(item.id)
                    }
                  }}
                  onToggleHidden={() => toggleHiddenForRow(item.id)}
                  onToggleLocked={() => toggleLockedForRow(item.id)}
                  onDragStart={(e) => beginDragItems(e, item.id)}
                  onDragOver={(e) => allowDropOn(e, 'item', item.id)}
                  onDragLeave={clearDrop}
                  onDrop={finishDrop}
                />
                {isLine('item', item.id, 'after') && (
                  <InsertLine depth={1} edge="after" />
                )}
              </div>
            ))}
          </>
        )}

        {items.length === 0 && folders.length === 0 && (
          <p className="px-3 py-4 text-center text-[10px] leading-relaxed text-[#666]">
            Empty. Drag items from the library, or add a folder with +.
          </p>
        )}
      </div>

      {hasSelection && (
        <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-t border-[#0a0a0a] bg-[#2b2b2b] px-1 py-1">
          <span className="mr-1 px-1 text-[9px] text-[#777]">
            {selectedIds.length > 1
              ? `${selectedIds.length} selected`
              : 'Selected'}
          </span>
          {primaryId && (
            <>
              <IconBtn
                title="Bring to front (top of stack)"
                onClick={() => bringToFront(primaryId)}
              >
                <ChevronsUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                title="Move up one layer"
                onClick={() => bringForward(primaryId)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                title="Move down one layer"
                onClick={() => sendBackward(primaryId)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                title="Send to back"
                onClick={() => sendToBack(primaryId)}
              >
                <ChevronsDown className="h-3.5 w-3.5" />
              </IconBtn>
            </>
          )}
          <IconBtn
            title={
              selectedIds.length > 1
                ? `Delete ${selectedIds.length} selected`
                : 'Delete'
            }
            onClick={() => removeItems(selectedIds)}
            danger
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      )}

      <p className="border-t border-[#0a0a0a] px-2 py-1 text-[9px] leading-snug text-[#555]">
        Multi-select: header eye/lock (or any selected row) toggles all selected
        · Drag between rows to reorder · Middle of collection = nest
      </p>
    </div>
  )
}

/** Blue insertion bar between rows while dragging. */
function InsertLine({
  depth,
  edge,
}: {
  depth: number
  edge: 'before' | 'after'
}) {
  return (
    <div
      className="pointer-events-none absolute left-0 right-1 z-20 h-0.5 -translate-y-1/2 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]"
      style={{
        top: edge === 'before' ? 0 : '100%',
        marginLeft: 6 + depth * 10,
      }}
      aria-hidden
    />
  )
}

function FolderHeaderRow({
  name,
  open,
  count,
  depth = 0,
  isRoot,
  vis,
  intoActive,
  renaming,
  renameDraft,
  onRenameDraft,
  onRenameKey,
  onRenameBlur,
  onToggleOpen,
  onSelectFolder,
  onToggleHidden,
  onToggleLocked,
  onStartRename,
  onDelete,
  onAddNested,
  draggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  name: string
  open: boolean
  count: number
  depth?: number
  isRoot: boolean
  vis: { allHidden: boolean; allLocked: boolean; empty: boolean }
  intoActive?: boolean
  renaming?: boolean
  renameDraft?: string
  onRenameDraft?: (v: string) => void
  onRenameKey?: (e: KeyboardEvent<HTMLInputElement>) => void
  onRenameBlur?: () => void
  onToggleOpen: () => void
  onSelectFolder: () => void
  onToggleHidden: () => void
  onToggleLocked: () => void
  onStartRename?: () => void
  onDelete?: () => void
  onAddNested?: () => void
  draggable?: boolean
  onDragStart?: (e: DragEvent) => void
  onDragOver?: (e: DragEvent) => void
  onDragLeave?: () => void
  onDrop?: (e: DragEvent) => void
}) {
  return (
    <div
      draggable={Boolean(draggable)}
      onDragStart={onDragStart}
      className={`group flex h-[24px] items-center border-b border-[#1a1a1a] ${
        intoActive
          ? 'bg-[#3d5a80]/90 ring-1 ring-inset ring-sky-400/80'
          : 'bg-[#2a2a2a] hover:bg-[#333]'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ paddingLeft: Math.max(2, depth * 10) }}
      onDoubleClick={(e) => {
        e.preventDefault()
        if (!isRoot && onStartRename) onStartRename()
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleOpen()
        }}
        className="flex h-5 w-4 shrink-0 items-center justify-center text-[#888]"
        title={open ? 'Collapse' : 'Expand'}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>
      <CollectionIcon />
      {renaming ? (
        <input
          autoFocus
          value={renameDraft ?? ''}
          onChange={(e) => onRenameDraft?.(e.target.value)}
          onKeyDown={onRenameKey}
          onBlur={onRenameBlur}
          className="min-w-0 flex-1 rounded border border-[#5a7a9a] bg-[#1a1a1a] px-1 py-0 text-[11px] font-medium text-white outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSelectFolder()
          }}
          className="min-w-0 flex-1 truncate text-left font-medium text-[#e8e8e8]"
          title={
            isRoot
              ? 'Sheet root — drop here to ungroup · click to select ungrouped'
              : 'Drag to reorder among collections · Drop on edges to slide · Middle = nest into'
          }
        >
          {name}
        </button>
      )}
      {!isRoot && !renaming && (
        <div className="mr-0.5 hidden items-center gap-0 group-hover:flex">
          {onAddNested && (
            <button
              type="button"
              title="Add nested collection"
              onClick={(e) => {
                e.stopPropagation()
                onAddNested()
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-[#888] hover:bg-black/30 hover:text-white"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            title="Rename folder"
            onClick={(e) => {
              e.stopPropagation()
              onStartRename?.()
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-[#888] hover:bg-black/30 hover:text-white"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Delete folder (items ungrouped / children promote)"
            onClick={(e) => {
              e.stopPropagation()
              onDelete?.()
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-[#888] hover:bg-[#5a2020] hover:text-[#e08080]"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
      <span className="pr-0.5 tabular-nums text-[10px] text-[#666]">{count}</span>
      <div className="flex w-[52px] shrink-0 justify-end gap-0.5 pr-0.5">
        <RestrictBtn
          title={
            vis.empty
              ? 'No items'
              : vis.allHidden
                ? 'Show all in folder tree'
                : 'Hide all in folder tree'
          }
          active={!vis.allHidden && !vis.empty}
          dimmed={vis.allHidden && !vis.empty}
          disabled={vis.empty}
          onClick={(e) => {
            e.stopPropagation()
            onToggleHidden()
          }}
        >
          {vis.allHidden && !vis.empty ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </RestrictBtn>
        <RestrictBtn
          title={
            vis.empty
              ? 'No items'
              : vis.allLocked
                ? 'Unlock all in folder tree'
                : 'Lock all in folder tree'
          }
          active={!vis.allLocked && !vis.empty}
          dimmed={vis.allLocked && !vis.empty}
          disabled={vis.empty}
          onClick={(e) => {
            e.stopPropagation()
            onToggleLocked()
          }}
        >
          {vis.allLocked && !vis.empty ? (
            <Lock className="h-3 w-3" />
          ) : (
            <LockOpen className="h-3 w-3 opacity-60" />
          )}
        </RestrictBtn>
      </div>
    </div>
  )
}

function OutlinerRow({
  item,
  depth,
  selected,
  dragging,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  item: CanvasItem
  depth: number
  selected: boolean
  dragging?: boolean
  onSelect: (e: MouseEvent) => void
  onToggleHidden: () => void
  onToggleLocked: () => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
}) {
  const hidden = item.hidden === true
  const locked = item.locked === true
  const TypeIcon = typeIcon(item)

  return (
    <div
      draggable={!locked}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group flex h-[22px] items-center border-b border-[#1a1a1a]/80 ${
        selected
          ? 'bg-[#3d5a80] text-white'
          : hidden
            ? 'bg-transparent text-[#666] hover:bg-[#2a2a2a]'
            : 'bg-transparent text-[#c8c8c8] hover:bg-[#2e2e2e]'
      } ${dragging ? 'opacity-50' : ''} ${locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
      style={{ paddingLeft: 8 + depth * 10 }}
    >
      <span className="flex h-5 w-3 shrink-0" />

      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1 truncate text-left"
        title={
          locked
            ? 'Locked — unlock to drag · Shift+click multi-select'
            : 'Drag between rows to reorder layers · Drop on collection middle to nest'
        }
      >
        <TypeIcon
          className={`h-3.5 w-3.5 shrink-0 ${
            selected ? 'text-[#b8d4f0]' : typeColor(item)
          }`}
        />
        <span
          className={`min-w-0 flex-1 truncate ${
            hidden ? 'italic line-through opacity-70' : ''
          }`}
        >
          {item.title || item.type}
        </span>
        {locked && (
          <Lock className="h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden />
        )}
      </button>

      {/* Eye + lock only (no star — favorites live on library hearts) */}
      <div className="flex w-[52px] shrink-0 justify-end gap-0.5 pr-0.5">
        <RestrictBtn
          title={
            hidden
              ? 'Show (multi-select: applies to all selected)'
              : 'Hide (multi-select: applies to all selected)'
          }
          active={!hidden}
          dimmed={hidden}
          onClick={(e) => {
            e.stopPropagation()
            onToggleHidden()
          }}
        >
          {hidden ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </RestrictBtn>
        <RestrictBtn
          title={
            locked
              ? 'Unlock (multi-select: applies to all selected)'
              : 'Lock (multi-select: applies to all selected)'
          }
          active={!locked}
          dimmed={locked}
          onClick={(e) => {
            e.stopPropagation()
            onToggleLocked()
          }}
        >
          {locked ? (
            <Lock className="h-3 w-3" />
          ) : (
            <LockOpen className="h-3 w-3 opacity-50" />
          )}
        </RestrictBtn>
      </div>
    </div>
  )
}

function typeIcon(item: CanvasItem) {
  if (item.type === 'process-chart' || item.mermaidSource) return GitBranch
  if (item.type === 'table' || item.tableMarkdown) return Table2
  if (item.type === 'definition') return BookOpen
  if (item.type === 'list') return List
  if (item.type === 'callout') return MessageSquare
  if (item.type === 'code') return Code2
  if (item.type === 'constant') return Pi
  if (item.type === 'identity-set') return Sigma
  if (item.type === 'matrix') return Grid3x3
  if (item.type === 'plot') return LineChart
  if (
    item.type === 'figure' ||
    item.type === 'custom-image' ||
    item.imageUrl
  ) {
    return ImageIcon
  }
  return Sigma
}

function typeColor(item: CanvasItem) {
  if (item.type === 'process-chart' || item.mermaidSource)
    return 'text-[#c4b5fd]'
  if (item.type === 'table' || item.tableMarkdown) return 'text-[#7ec8e3]'
  if (item.type === 'definition') return 'text-[#f9a8d4]'
  if (item.type === 'list') return 'text-[#93c5fd]'
  if (item.type === 'callout') return 'text-[#fcd34d]'
  if (item.type === 'code') return 'text-[#a3e635]'
  if (item.type === 'constant') return 'text-[#67e8f9]'
  if (item.type === 'identity-set') return 'text-[#c4b5fd]'
  if (item.type === 'matrix') return 'text-[#fda4af]'
  if (item.type === 'plot') return 'text-[#6ee7b7]'
  if (
    item.type === 'figure' ||
    item.type === 'custom-image' ||
    item.imageUrl
  ) {
    return 'text-[#e0a86e]'
  }
  return 'text-[#a0c96b]'
}

function CollectionIcon() {
  return (
    <span
      className="mr-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] bg-[#4a7ab0] text-[8px] font-bold text-white"
      aria-hidden
    >
      C
    </span>
  )
}

function RestrictBtn({
  children,
  onClick,
  title,
  active,
  dimmed,
  disabled,
}: {
  children: ReactNode
  onClick: (e: MouseEvent) => void
  title: string
  active?: boolean
  dimmed?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-5 w-5 items-center justify-center rounded-sm transition hover:bg-black/25 disabled:cursor-default disabled:opacity-30 ${
        dimmed
          ? 'text-[#e07070]'
          : active
            ? 'text-[#aaa] group-hover:text-[#ddd]'
            : 'text-[#555]'
      }`}
    >
      {children}
    </button>
  )
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  title: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded p-1 ${
        danger
          ? 'text-[#e08080] hover:bg-[#5a2020]'
          : 'text-[#999] hover:bg-[#3a3a3a] hover:text-[#eee]'
      }`}
    >
      {children}
    </button>
  )
}
