import { create } from 'zustand'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { SEED_LIBRARY } from '@/data/seedLibrary'
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
  if (cloud.type === 'figure' || seed.type === 'figure') {
    if (isSvgUrl(seed.imageUrl) && !isSvgUrl(cloud.imageUrl)) {
      return {
        ...cloud,
        type: 'figure',
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
  return cloud
}

interface LibraryState {
  items: LibraryItem[]
  loading: boolean
  source: 'seed' | 'firestore'
  load: () => Promise<void>
  getById: (id: string) => LibraryItem | undefined
  bySubject: (subject: Subject) => LibraryItem[]
  topicsFor: (subject: Subject) => string[]
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items: SEED_LIBRARY,
  loading: false,
  source: 'seed',

  load: async () => {
    set({ loading: true })
    try {
      const q = query(collection(db, 'libraryItems'), orderBy('title'))
      const snap = await getDocs(q)
      if (!snap.empty) {
        const items = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>
          const latex = data.latex as string | undefined
          const tableMarkdown = data.tableMarkdown as string | undefined
          let imageUrl = data.imageUrl as string | undefined
          let type = data.type as LibraryItem['type'] | undefined
          // Infer type for older cloud docs missing `type`
          if (!type) {
            if (latex) type = 'equation'
            else if (tableMarkdown) type = 'table'
            else if (imageUrl) type = 'figure'
            else type = 'equation'
          }
          const cloud = {
            id: d.id,
            type,
            title: (data.title as string) ?? 'Untitled',
            subject: (data.subject as LibraryItem['subject']) ?? 'mathematics',
            topic: (data.topic as string) ?? 'General',
            tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
            latex,
            tableMarkdown,
            imageUrl,
            imagePath: data.imagePath as string | undefined,
            description: data.description as string | undefined,
            source: data.source as string | undefined,
            isSystem: (data.isSystem as boolean) ?? false,
            createdBy: data.createdBy as string | undefined,
          } as LibraryItem
          // Affirmative: never serve raster diagrams when seed has SVG for this id
          return preferSeedVector(cloud)
        })
        set({ items, source: 'firestore', loading: false })
        return
      }
    } catch {
      // Offline / rules not ready — fall back to seed (always vector)
    }
    set({ items: SEED_LIBRARY, source: 'seed', loading: false })
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
}))
