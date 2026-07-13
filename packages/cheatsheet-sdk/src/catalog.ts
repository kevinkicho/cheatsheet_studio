/**
 * Studio seed catalog + curated process blocks for agents.
 * 1) Monorepo: live import of src/data/seedLibrary.ts
 * 2) Published package: data/seed-catalog.json snapshot
 * 3) Always merges PROCESS_BLOCKS (flowcharts / mind maps)
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  findProcessBlock,
  listProcessBlocks,
  PROCESS_BLOCKS,
  type ProcessBlock,
} from './process-blocks'

export type CatalogBlockType =
  | 'equation'
  | 'table'
  | 'figure'
  | 'process'

export type CatalogItem = {
  id: string
  type: CatalogBlockType
  title: string
  subject?: string
  topic?: string
  tags?: string[]
  latex?: string
  tableMarkdown?: string
  imageUrl?: string
  description?: string
  /** Process charts only */
  mermaidSource?: string
  mermaidKind?: 'flowchart' | 'mindmap'
  mermaidDirection?: 'TD' | 'LR' | 'BT' | 'RL'
}

/** Alias — “blocks” is the agent-facing name for catalog items. */
export type StudioBlock = CatalogItem

let cache: CatalogItem[] | null = null

function pkgRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..')
}

function monorepoRoot(): string {
  return path.resolve(pkgRoot(), '../..')
}

function mapSeed(
  list: Array<{
    id: string
    type: string
    title: string
    subject?: string
    topic?: string
    tags?: string[]
    latex?: string
    tableMarkdown?: string
    imageUrl?: string
    description?: string
    mermaidSource?: string
    mermaidKind?: string
    mermaidDirection?: string
  }>,
): CatalogItem[] {
  return list
    .filter(
      (i) =>
        i.type === 'equation' ||
        i.type === 'table' ||
        i.type === 'figure' ||
        i.type === 'process',
    )
    .map((i) => {
      const base: CatalogItem = {
        id: i.id,
        type: i.type as CatalogItem['type'],
        title: i.title,
        subject: i.subject,
        topic: i.topic,
        tags: i.tags,
        latex: i.latex,
        tableMarkdown: i.tableMarkdown,
        imageUrl: i.imageUrl,
        description: i.description,
      }
      if (i.type === 'process' || i.mermaidSource) {
        base.mermaidSource = i.mermaidSource
        base.mermaidKind =
          i.mermaidKind === 'mindmap' ? 'mindmap' : 'flowchart'
        if (
          i.mermaidDirection === 'TD' ||
          i.mermaidDirection === 'LR' ||
          i.mermaidDirection === 'BT' ||
          i.mermaidDirection === 'RL'
        ) {
          base.mermaidDirection = i.mermaidDirection
        }
        base.type = 'process'
      }
      return base
    })
}

function processAsCatalog(): CatalogItem[] {
  return PROCESS_BLOCKS.map((b) => ({ ...b }))
}

function mergeWithProcess(seed: CatalogItem[]): CatalogItem[] {
  const byId = new Map<string, CatalogItem>()
  for (const p of processAsCatalog()) byId.set(p.id, p)
  for (const s of seed) {
    // Seed wins on id collision only if not a process we own
    if (!byId.has(s.id) || s.type !== 'process') {
      byId.set(s.id, s)
    }
  }
  // Ensure all process blocks present
  for (const p of processAsCatalog()) {
    if (!byId.has(p.id)) byId.set(p.id, p)
    else if (byId.get(p.id)!.type !== 'process') {
      // keep seed equation etc.; process ids are proc-* namespaced
      byId.set(p.id, p)
    }
  }
  return [...byId.values()]
}

function loadBundledSnapshot(): CatalogItem[] | null {
  const candidates = [
    path.join(pkgRoot(), 'data', 'seed-catalog.json'),
    path.join(monorepoRoot(), 'packages/cheatsheet-sdk/data/seed-catalog.json'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as {
        items?: Parameters<typeof mapSeed>[0]
      }
      if (Array.isArray(raw.items) && raw.items.length > 0) {
        return mapSeed(raw.items)
      }
    } catch {
      /* try next */
    }
  }
  return null
}

export async function loadSeedCatalog(): Promise<CatalogItem[]> {
  if (cache) return cache

  const liveCandidates = [
    path.join(monorepoRoot(), 'src', 'data', 'seedLibrary.ts'),
    path.resolve(process.cwd(), 'src', 'data', 'seedLibrary.ts'),
  ]

  for (const seedPath of liveCandidates) {
    if (!existsSync(seedPath)) continue
    try {
      const mod = await import(pathToFileURL(seedPath).href)
      const list = (mod.SEED_LIBRARY ?? []) as Parameters<typeof mapSeed>[0]
      const seed = mapSeed(list)
      if (seed.length > 0) {
        cache = mergeWithProcess(seed)
        return cache
      }
    } catch {
      /* try snapshot */
    }
  }

  const snap = loadBundledSnapshot()
  if (snap && snap.length > 0) {
    cache = mergeWithProcess(snap)
    return cache
  }

  // Process blocks alone still useful offline
  cache = processAsCatalog()
  if (cache.length > 0) return cache

  throw new Error(
    'Could not load seed catalog. Run from monorepo root, or rebuild package data with npm run sdk:export-catalog.',
  )
}

/** Clear cache (tests / after catalog export). */
export function clearCatalogCache(): void {
  cache = null
}

export type CatalogSearchOpts = {
  query?: string
  /** equation | table | figure | process | all */
  type?: CatalogBlockType | 'all'
  subject?: string
  /** flowchart | mindmap — only applies when type is process or all */
  processKind?: 'flowchart' | 'mindmap' | 'all'
  limit?: number
  /** topic substring match */
  topic?: string
  /** tag exact (case-insensitive) */
  tag?: string
}

export async function searchCatalog(
  opts: CatalogSearchOpts = {},
): Promise<CatalogItem[]> {
  const all = await loadSeedCatalog()
  const q = (opts.query ?? '').trim().toLowerCase()
  const type = opts.type ?? 'all'
  const subject = (opts.subject ?? '').trim().toLowerCase()
  const topic = (opts.topic ?? '').trim().toLowerCase()
  const tag = (opts.tag ?? '').trim().toLowerCase()
  const processKind = opts.processKind ?? 'all'
  const limit = Math.min(200, Math.max(1, opts.limit ?? 20))

  let list = all
  if (type !== 'all') list = list.filter((i) => i.type === type)
  if (subject) {
    list = list.filter(
      (i) =>
        (i.subject ?? '').toLowerCase() === subject ||
        (i.subject ?? '').toLowerCase().includes(subject),
    )
  }
  if (topic) {
    list = list.filter((i) => (i.topic ?? '').toLowerCase().includes(topic))
  }
  if (tag) {
    list = list.filter((i) =>
      (i.tags ?? []).some((t) => t.toLowerCase() === tag),
    )
  }
  if (processKind !== 'all') {
    list = list.filter(
      (i) => i.type !== 'process' || i.mermaidKind === processKind,
    )
  }
  if (q) {
    list = list.filter((i) => {
      const hay = [
        i.id,
        i.title,
        i.topic,
        i.description,
        ...(i.tags ?? []),
        i.latex,
        i.mermaidSource,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
    list.sort((a, b) => {
      const at = a.title.toLowerCase().startsWith(q) ? 0 : 1
      const bt = b.title.toLowerCase().startsWith(q) ? 0 : 1
      return at - bt || a.title.localeCompare(b.title)
    })
  }

  return list.slice(0, limit)
}

/**
 * Agent-friendly alias for searchCatalog — browse Studio blocks by type.
 */
export async function searchBlocks(
  opts: CatalogSearchOpts = {},
): Promise<StudioBlock[]> {
  return searchCatalog(opts)
}

export async function listBlocks(
  opts: CatalogSearchOpts & { limit?: number } = {},
): Promise<StudioBlock[]> {
  return searchCatalog({ ...opts, limit: opts.limit ?? 100 })
}

export async function listBlocksByType(
  type: CatalogBlockType,
  opts?: Omit<CatalogSearchOpts, 'type'>,
): Promise<StudioBlock[]> {
  return searchCatalog({ ...opts, type, limit: opts?.limit ?? 100 })
}

export async function findCatalogItem(
  idOrTitle: string,
): Promise<CatalogItem | null> {
  const proc = findProcessBlock(idOrTitle)
  if (proc) return { ...proc }

  const all = await loadSeedCatalog()
  const key = idOrTitle.trim().toLowerCase()
  const byId = all.find((i) => i.id.toLowerCase() === key)
  if (byId) return byId
  const byTitle = all.find((i) => i.title.toLowerCase() === key)
  if (byTitle) return byTitle
  const partial = all.find((i) => i.title.toLowerCase().includes(key))
  return partial ?? null
}

export async function getBlock(idOrTitle: string): Promise<StudioBlock | null> {
  return findCatalogItem(idOrTitle)
}

/** Counts by block type (for doctor / CLI). */
export async function catalogStats(): Promise<Record<string, number>> {
  const all = await loadSeedCatalog()
  const stats: Record<string, number> = {
    total: all.length,
    equation: 0,
    table: 0,
    figure: 0,
    process: 0,
  }
  for (const i of all) {
    stats[i.type] = (stats[i.type] ?? 0) + 1
  }
  return stats
}

export {
  listProcessBlocks,
  findProcessBlock,
  PROCESS_BLOCKS,
  type ProcessBlock,
}
