/**
 * Search / resolve items from the Studio seed catalog (monorepo).
 * Loads src/data/seedLibrary.ts when run from the repo root via tsx.
 * Never bundled into the web app.
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

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

function repoRootFromHere(): string {
  // packages/cheatsheet-sdk/src → monorepo root
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../../..')
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

export async function loadSeedCatalog(): Promise<CatalogItem[]> {
  if (cache) return cache

  const candidates = [
    path.join(repoRootFromHere(), 'src', 'data', 'seedLibrary.ts'),
    path.resolve(process.cwd(), 'src', 'data', 'seedLibrary.ts'),
  ]

  const errors: string[] = []
  for (const seedPath of candidates) {
    try {
      const mod = await import(pathToFileURL(seedPath).href)
      const list = (mod.SEED_LIBRARY ?? []) as Parameters<typeof mapSeed>[0]
      cache = mapSeed(list)
      if (cache.length > 0) return cache
    } catch (e) {
      errors.push(
        `${seedPath}: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  throw new Error(
    `Could not load seed catalog. Run CLI from monorepo root.\n${errors.join('\n')}`,
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
    // Prefer title prefix matches
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
