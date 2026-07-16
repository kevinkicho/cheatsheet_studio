import { create } from 'zustand'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { SEED_LIBRARY } from '@/data/seedLibrary'
import { inferLibraryType } from '@/lib/cardKinds'
import { hasProseMath } from '@/lib/proseMath'
import {
  loadCatalogFromRtdb,
  publishCatalogToRtdb,
} from '@/lib/catalogRtdb'
import type { CatalogMeta, CatalogSource } from '@/lib/catalogTypes'
import {
  buildTopicInventory,
  countsBySubject,
  thinTopics,
} from '@/lib/catalogInventory'
import type { LibraryItem, Subject } from '@/types'

/**
 * VECTOR GRAPHICS: library content must stay sharp on canvas resize.
 * Seed catalog is LaTeX / markdown tables / SVG only (docs/vector-graphics.md).
 * When Firestore has a stale system figure as raster, prefer the seed SVG.
 */
const SEED_BY_ID = new Map(SEED_LIBRARY.map((i) => [i.id, i]))

function isSvgUrl(url: string | undefined): boolean {
  if (!url) return false
  return /^data:image\/svg\+xml/i.test(url) || /\.svg(\?|#|$)/i.test(url)
}

/** Prefer seed vector payload when cloud doc is missing or raster for same id. */
function preferSeedVector(cloud: LibraryItem): LibraryItem {
  const seed = SEED_BY_ID.get(cloud.id)
  if (!seed) return cloud
  if (
    cloud.type === 'figure' ||
    seed.type === 'figure' ||
    cloud.type === 'plot' ||
    seed.type === 'plot'
  ) {
    if (isSvgUrl(seed.imageUrl) && !isSvgUrl(cloud.imageUrl)) {
      return {
        ...cloud,
        type: seed.type === 'plot' || cloud.type === 'plot' ? 'plot' : 'figure',
        imageUrl: seed.imageUrl,
        latex: undefined,
        tableMarkdown: undefined,
      }
    }
  }
  if (
    (cloud.type === 'equation' || seed.type === 'equation') &&
    seed.latex &&
    !cloud.latex?.trim()
  ) {
    return { ...cloud, type: 'equation', latex: seed.latex, imageUrl: undefined }
  }
  if (
    (cloud.type === 'table' || seed.type === 'table') &&
    seed.tableMarkdown &&
    !cloud.tableMarkdown?.trim()
  ) {
    return {
      ...cloud,
      type: 'table',
      tableMarkdown: seed.tableMarkdown,
      imageUrl: undefined,
    }
  }
  // Prefer seed definition body when cloud still has plain (no $math$) prose
  // but seed was upgraded with KaTeX delimiters.
  if (
    (cloud.type === 'definition' || seed.type === 'definition') &&
    seed.body?.trim() &&
    hasProseMath(seed.body) &&
    !hasProseMath(cloud.body ?? '')
  ) {
    return {
      ...cloud,
      type: 'definition',
      body: seed.body,
      term: cloud.term?.trim() ? cloud.term : seed.term,
    }
  }
  return cloud
}

function mapFirestoreDoc(
  id: string,
  data: Record<string, unknown>,
): LibraryItem {
  const type = inferLibraryType(data as Partial<LibraryItem>)
  const cloud = {
    id,
    type,
    title: (data.title as string) ?? 'Untitled',
    subject: (data.subject as LibraryItem['subject']) ?? 'mathematics',
    topic: (data.topic as string) ?? 'General',
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    latex: data.latex as string | undefined,
    tableMarkdown: data.tableMarkdown as string | undefined,
    imageUrl: data.imageUrl as string | undefined,
    imagePath: data.imagePath as string | undefined,
    description: data.description as string | undefined,
    source: data.source as string | undefined,
    isSystem: (data.isSystem as boolean) ?? false,
    createdBy: data.createdBy as string | undefined,
    term: data.term as string | undefined,
    body: data.body as string | undefined,
    listItems: Array.isArray(data.listItems)
      ? (data.listItems as string[])
      : undefined,
    listOrdered: data.listOrdered as boolean | undefined,
    calloutVariant: data.calloutVariant as
      | LibraryItem['calloutVariant']
      | undefined,
    code: data.code as string | undefined,
    codeLanguage: data.codeLanguage as string | undefined,
    symbol: data.symbol as string | undefined,
    value: data.value as string | undefined,
    unit: data.unit as string | undefined,
    identities: Array.isArray(data.identities)
      ? (data.identities as string[])
      : undefined,
    matrixRows: Array.isArray(data.matrixRows)
      ? (data.matrixRows as string[][])
      : undefined,
  } as LibraryItem
  return preferSeedVector(cloud)
}

interface LibraryState {
  items: LibraryItem[]
  loading: boolean
  source: CatalogSource
  catalogMeta: CatalogMeta | null
  lastError: string | null
  load: () => Promise<{ source: CatalogSource; count: number }>
  /** Replace in-memory catalog and optionally publish bulk to RTDB. */
  setItems: (
    items: LibraryItem[],
    opts?: { publishRtdb?: boolean; note?: string; model?: string },
  ) => Promise<void>
  getById: (id: string) => LibraryItem | undefined
  bySubject: (subject: Subject) => LibraryItem[]
  topicsFor: (subject: Subject) => string[]
  inventory: () => ReturnType<typeof buildTopicInventory>
  thin: (minCount?: number) => ReturnType<typeof thinTopics>
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items: SEED_LIBRARY,
  loading: false,
  source: 'seed',
  catalogMeta: null,
  lastError: null,

  load: async () => {
    set({ loading: true, lastError: null })

    // 1) Prefer RTDB bulk snapshot (single download)
    try {
      const bulk = await loadCatalogFromRtdb()
      if (bulk && bulk.items.length > 0) {
        const items = bulk.items.map((it) => preferSeedVector(it))
        set({
          items,
          source: 'rtdb',
          catalogMeta: bulk.meta,
          loading: false,
        })
        return { source: 'rtdb' as const, count: items.length }
      }
    } catch (e) {
      console.warn('[libraryStore] RTDB load', e)
    }

    // 2) Firestore document collection (legacy / seed script)
    try {
      const q = query(collection(db, 'libraryItems'), orderBy('title'))
      const snap = await getDocs(q)
      if (!snap.empty) {
        const items = snap.docs.map((d) =>
          mapFirestoreDoc(d.id, d.data() as Record<string, unknown>),
        )
        set({
          items,
          source: 'firestore',
          catalogMeta: {
            version: 1,
            updatedAt: Date.now(),
            itemCount: items.length,
            source: 'firestore',
            bySubject: countsBySubject(items),
          },
          loading: false,
        })
        return { source: 'firestore' as const, count: items.length }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set({ lastError: msg })
    }

    // 3) Bundled seed
    set({
      items: SEED_LIBRARY,
      source: 'seed',
      catalogMeta: {
        version: 0,
        updatedAt: Date.now(),
        itemCount: SEED_LIBRARY.length,
        source: 'seed',
        bySubject: countsBySubject(SEED_LIBRARY),
        note: 'Bundled seed (offline / empty cloud)',
      },
      loading: false,
    })
    return { source: 'seed' as const, count: SEED_LIBRARY.length }
  },

  setItems: async (items, opts) => {
    set({ items, lastError: null })
    if (opts?.publishRtdb) {
      try {
        const meta = await publishCatalogToRtdb(items, {
          note: opts.note,
          model: opts.model,
          source: 'enrich',
        })
        set({ source: 'rtdb', catalogMeta: meta })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        set({ lastError: msg })
        throw e
      }
    }
  },

  getById: (id) => get().items.find((i) => i.id === id),

  bySubject: (subject) => get().items.filter((i) => i.subject === subject),

  topicsFor: (subject) => {
    const topics = new Set(
      get()
        .items.filter((i) => i.subject === subject)
        .map((i) => i.topic),
    )
    return Array.from(topics).sort()
  },

  inventory: () => buildTopicInventory(get().items),
  thin: (minCount = 4) => thinTopics(get().items, minCount),
}))
