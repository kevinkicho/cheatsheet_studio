import type { CanvasItem } from '@/types'
import type { GroupSortOrder, PanelGroupLevel } from './constants'

export function isProcessItem(it: CanvasItem): boolean {
  return it.type === 'process-chart' || Boolean(it.mermaidSource)
}

export type FolderRef = { id: string; name?: string; parentId?: string | null }

/**
 * Ancestor chain root → leaf for a folder id.
 * Example: 1.1.a → [id_of_1, id_of_1.1, id_of_1.1.a]
 */
export function folderAncestorChain(
  folderId: string | null | undefined,
  folders: FolderRef[] = [],
): string[] {
  if (!folderId) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const leafToRoot: string[] = []
  let cur: string | null | undefined = folderId
  const seen = new Set<string>()
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur)
    leafToRoot.push(cur)
    cur = byId.get(cur)!.parentId
  }
  // Unknown id (not in folders list): treat as single-node chain
  if (leafToRoot.length === 0 && folderId) return [folderId]
  return leafToRoot.reverse()
}

/**
 * Map a card’s folder to the folder that owns its panel at depth `level` (1–3).
 * Paths deeper than 3 clamp to the 3rd ancestor from the root.
 */
export function folderAtGroupLevel(
  folderId: string | null | undefined,
  folders: FolderRef[] = [],
  level: PanelGroupLevel = 1,
): string | null {
  if (!folderId) return null
  const depth = Math.min(3, Math.max(1, Math.floor(Number(level) || 1)))
  const chain = folderAncestorChain(folderId, folders)
  if (chain.length === 0) return folderId
  const idx = Math.min(depth, chain.length) - 1
  return chain[idx] ?? folderId
}

/** Fixed UI options: Level 1 / 2 / 3 — multi-select for nested panels. */
export function panelGroupLevelOptions(): Array<{
  level: PanelGroupLevel
  label: string
  hint: string
}> {
  return [
    {
      level: 1,
      label: 'Level 1',
      hint: 'Outer: top sections (1, 2, 3…)',
    },
    {
      level: 2,
      label: 'Level 2',
      hint: 'Inner: subsections (1.1, 1.2…)',
    },
    {
      level: 3,
      label: 'Level 3',
      hint: 'Innermost: third level from top',
    },
  ]
}

/**
 * Hierarchical path for a folder (parent / child / …), multi-level deep.
 */
export function folderHierarchyPath(
  folderId: string | null | undefined,
  folders: FolderRef[] = [],
): string {
  if (!folderId) return ''
  const byId = new Map(folders.map((f) => [f.id, f]))
  const chain = folderAncestorChain(folderId, folders)
  if (chain.length === 0) return folderId
  return chain
    .map((id) => {
      const f = byId.get(id)
      return (f?.name ?? id).trim() || id
    })
    .join(' / ')
}

/** Sort key for a section: hierarchy path (+ heading when leaf bands). */
export function sectionSortKey(
  section: CanvasItem[],
  folders: Array<{ id: string; name?: string; parentId?: string | null }> = [],
  panelGroupLevel: PanelGroupLevel = 1,
): string {
  const raw =
    section.find((i) => i.folderId)?.folderId ??
    section.find((i) => !isHeadingCard(i))?.folderId ??
    null
  const folderId = folderAtGroupLevel(raw, folders, panelGroupLevel)
  const path = folderHierarchyPath(folderId, folders)
  return `${path}\u0000`.toLocaleLowerCase()
}

/**
 * Reorder sections by hierarchical name (or leave document order).
 */
export function sortCheatSections(
  sections: CanvasItem[][],
  order: GroupSortOrder,
  folders: Array<{ id: string; name?: string; parentId?: string | null }> = [],
  panelGroupLevel: PanelGroupLevel = 1,
): CanvasItem[][] {
  if (order === 'none' || sections.length <= 1) return sections
  const dir = order === 'name-desc' ? -1 : 1
  return [...sections].sort((a, b) => {
    const ka = sectionSortKey(a, folders, panelGroupLevel)
    const kb = sectionSortKey(b, folders, panelGroupLevel)
    if (ka < kb) return -1 * dir
    if (ka > kb) return 1 * dir
    return 0
  })
}

/**
 * Split items into layout sections.
 * Prefer Layers folders (folderId) so same-folder cards stay clustered.
 *
 * `panelGroupLevel` (1|2|3) controls which ancestor owns the panel:
 * - 1: top-level — 1.1 + 1.2 cards merge into panel “1”
 * - 2 / 3: truncate path at that depth from the root
 *
 * Base order (before groupSort): first appearance of each group key in items.
 */
export function splitCheatSections(
  items: CanvasItem[],
  opts: {
    groupByFolder?: boolean
    folders?: Array<{
      id: string
      order?: number
      name?: string
      parentId?: string | null
    }>
    groupSort?: GroupSortOrder
    panelGroupLevel?: PanelGroupLevel
  } = {},
): CanvasItem[][] {
  const groupByFolder = opts.groupByFolder !== false
  const folders = opts.folders ?? []
  const rawLevel = opts.panelGroupLevel ?? 1
  const level = (Math.min(3, Math.max(1, Number(rawLevel) || 1)) ||
    1) as PanelGroupLevel
  const hasFolders =
    groupByFolder && items.some((i) => Boolean(i.folderId))

  let sections: CanvasItem[][]
  if (!hasFolders) {
    sections = splitByHeadings(items)
  } else {
    // Map each card to its panel group key (ancestor at level 1–3)
    const groupKeyOf = (it: CanvasItem): string | null => {
      const raw = it.folderId ?? null
      if (!raw) return null
      return folderAtGroupLevel(raw, folders, level)
    }

    const firstIndex = new Map<string | null, number>()
    items.forEach((it, i) => {
      const key = groupKeyOf(it)
      if (!firstIndex.has(key)) firstIndex.set(key, i)
    })

    const folderKeys = Array.from(firstIndex.keys()).sort((a, b) => {
      if (a == null && b == null) return 0
      if (a == null) return 1 // ungrouped last
      if (b == null) return -1
      return (firstIndex.get(a) ?? 0) - (firstIndex.get(b) ?? 0)
    })

    sections = []
    for (const key of folderKeys) {
      const group = items.filter((i) => groupKeyOf(i) === key)
      // One continuous panel per hierarchy node (no heading-split → extra panels)
      if (group.length) sections.push(group)
    }
    if (sections.length === 0) sections = [items]
  }

  return sortCheatSections(
    sections,
    opts.groupSort ?? 'none',
    folders,
    level,
  )
}

export function splitByHeadings(items: CanvasItem[]): CanvasItem[][] {
  const sections: CanvasItem[][] = []
  let cur: CanvasItem[] = []
  for (const it of items) {
    if (isHeadingCard(it) && cur.length > 0) {
      sections.push(cur)
      cur = [it]
    } else {
      cur.push(it)
    }
  }
  if (cur.length) sections.push(cur)
  return sections
}

export function isHeadingCard(it: CanvasItem): boolean {
  if (it.mermaidSource || it.tableMarkdown || it.type === 'process-chart') {
    return false
  }
  const title = (it.title ?? '').trim()
  const t = (it.latex ?? '').trim()
  if (!t) return false
  // Numbered section dividers ("1. …") and \textbf{\text{…}} banners
  if (/^\d+\.\s+\S/.test(title) && t.includes('\\text{') && t.length < 160) {
    return true
  }
  if (it.showTitle === false && t.includes('\\text{') && t.length < 160) {
    return true
  }
  if (
    (/^\\text\{/.test(t) || /^\\textbf\{\\text\{/.test(t)) &&
    t.length < 160
  ) {
    return true
  }
  return false
}

// ─── Grid area-proportional pack (agent-friendly cheatsheet layout) ─────────
