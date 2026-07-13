/**
 * Search / resolve items from the Studio seed catalog.
 * 1) Monorepo: live import of src/data/seedLibrary.ts
 * 2) Published package: data/seed-catalog.json snapshot
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export type CatalogItem = {
  id: string
  type: 'equation' | 'table' | 'figure'
  title: string
  subject?: string
  topic?: string
  tags?: string[]
  latex?: string
  tableMarkdown?: string
  imageUrl?: string
  description?: string
}

let cache: CatalogItem[] | null = null

function pkgRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  // src/ or dist/
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
  }>,
): CatalogItem[] {
  return list
    .filter(
      (i) =>
        i.type === 'equation' || i.type === 'table' || i.type === 'figure',
    )
    .map((i) => ({
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
    }))
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
      cache = mapSeed(list)
      if (cache.length > 0) return cache
    } catch {
      /* try snapshot */
    }
  }

  const snap = loadBundledSnapshot()
  if (snap && snap.length > 0) {
    cache = snap
    return cache
  }

  throw new Error(
    'Could not load seed catalog. Run from monorepo root, or rebuild package data with npm run sdk:export-catalog.',
  )
}

export type CatalogSearchOpts = {
  query?: string
  type?: CatalogItem['type'] | 'all'
  subject?: string
  limit?: number
}

export async function searchCatalog(
  opts: CatalogSearchOpts = {},
): Promise<CatalogItem[]> {
  const all = await loadSeedCatalog()
  const q = (opts.query ?? '').trim().toLowerCase()
  const type = opts.type ?? 'all'
  const subject = (opts.subject ?? '').trim().toLowerCase()
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20))

  let list = all
  if (type !== 'all') list = list.filter((i) => i.type === type)
  if (subject) {
    list = list.filter((i) => (i.subject ?? '').toLowerCase() === subject)
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

export async function findCatalogItem(
  idOrTitle: string,
): Promise<CatalogItem | null> {
  const all = await loadSeedCatalog()
  const key = idOrTitle.trim().toLowerCase()
  const byId = all.find((i) => i.id.toLowerCase() === key)
  if (byId) return byId
  const byTitle = all.find((i) => i.title.toLowerCase() === key)
  if (byTitle) return byTitle
  const partial = all.find((i) => i.title.toLowerCase().includes(key))
  return partial ?? null
}
