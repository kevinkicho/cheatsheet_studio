import type { CanvasItem, LayoutPanel } from '@/types'

export type FolderRef = { id: string; parentId?: string | null }

/** Folder id + every nested descendant folder id. */
export function folderTreeIds(
  rootId: string,
  folders: FolderRef[],
): Set<string> {
  const out = new Set<string>([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id)
        grew = true
      }
    }
  }
  return out
}

/**
 * Live membership for a folder-bound panel: cards whose folderId is the
 * panel's folder or a nested sub-collection.
 */
export function memberIdsForPanelFolder(
  panelFolderId: string,
  items: CanvasItem[],
  folders: FolderRef[],
): string[] {
  const tree = folderTreeIds(panelFolderId, folders)
  return items
    .filter((i) => !i.hidden && i.folderId != null && tree.has(i.folderId))
    .map((i) => i.id)
}

/**
 * After cards change Layers collection (folderId), rebuild panel.memberIds
 * from live folder assignment so old panels stop claiming moved cards.
 * Panels without folderId keep their explicit list (minus missing items).
 */
export function resyncLayoutPanelMembersFromFolders(
  panels: LayoutPanel[],
  items: CanvasItem[],
  folders: FolderRef[],
): LayoutPanel[] {
  if (panels.length === 0) return panels
  const byId = new Set(items.map((i) => i.id))
  return panels.map((p) => {
    if (p.folderId) {
      const memberIds = memberIdsForPanelFolder(p.folderId, items, folders)
      return { ...p, memberIds }
    }
    // Unbound chrome: drop ids that no longer exist
    const memberIds = (p.memberIds ?? []).filter((id) => byId.has(id))
    return memberIds.length === (p.memberIds?.length ?? 0)
      ? p
      : { ...p, memberIds }
  })
}

/**
 * Resolve which cards belong to a panel for in-panel auto-layout.
 *
 * Priority:
 * 1. If panel.folderId is set and folders provided → **live** folder tree
 *    (so moving cards between Layers collections sticks).
 * 2. Explicit memberIds that still exist (and, if folder-bound, still in tree).
 * 3. Nested-child panels / geometry recovery.
 */
export function resolvePanelMemberIds(
  panel: LayoutPanel,
  items: CanvasItem[],
  allPanels: LayoutPanel[] = [],
  folders: FolderRef[] = [],
): string[] {
  const visible = items.filter((i) => !i.hidden)
  const byId = new Map(visible.map((i) => [i.id, i]))

  // Folder-bound panels follow Layers assignment (authoritative)
  if (panel.folderId && folders.length > 0) {
    const live = memberIdsForPanelFolder(panel.folderId, visible, folders)
    if (live.length > 0) return live
  }

  let explicit = (panel.memberIds ?? []).filter((id) => byId.has(id))
  // Stale memberIds: drop cards that left this collection
  if (panel.folderId && folders.length > 0 && explicit.length > 0) {
    const tree = folderTreeIds(panel.folderId, folders)
    explicit = explicit.filter((id) => {
      const it = byId.get(id)
      return it?.folderId != null && tree.has(it.folderId)
    })
  }
  if (explicit.length > 0) return explicit

  // Nested panels wholly inside this panel — use their members
  const nestedIds: string[] = []
  for (const p of allPanels) {
    if (p.id === panel.id) continue
    const mids = p.memberIds ?? []
    if (mids.length === 0) continue
    const kids = mids.map((id) => byId.get(id)).filter(Boolean) as CanvasItem[]
    if (kids.length === 0) continue
    const allInside = kids.every((c) =>
      cardCenterInPanel(c, panel, /* inflate */ 24),
    )
    if (allInside) {
      for (const id of mids) {
        if (byId.has(id) && !nestedIds.includes(id)) nestedIds.push(id)
      }
    }
  }
  if (nestedIds.length > 0) return nestedIds

  // Geometry recovery: center of card inside panel (slight inflate for pad)
  // Skip cards that belong to a *different* folder-bound panel's tree
  const claimedByOtherFolder = new Set<string>()
  if (folders.length > 0) {
    for (const p of allPanels) {
      if (p.id === panel.id || !p.folderId) continue
      for (const id of memberIdsForPanelFolder(p.folderId, visible, folders)) {
        claimedByOtherFolder.add(id)
      }
    }
  }
  const recovered = visible
    .filter((c) => {
      if (claimedByOtherFolder.has(c.id)) return false
      return cardCenterInPanel(c, panel, 32)
    })
    .map((c) => c.id)
  return recovered
}

function cardCenterInPanel(
  c: CanvasItem,
  panel: LayoutPanel,
  inflate: number,
): boolean {
  const cx = c.x + c.width / 2
  const cy = c.y + c.height / 2
  const L = panel.x - inflate
  const T = panel.y - inflate
  const R = panel.x + panel.width + inflate
  const B = panel.y + panel.height + inflate
  return cx >= L && cx <= R && cy >= T && cy <= B
}
