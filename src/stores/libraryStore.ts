import { create } from 'zustand'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { SEED_LIBRARY } from '@/data/seedLibrary'
import type { LibraryItem, Subject } from '@/types'

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
          const imageUrl = data.imageUrl as string | undefined
          let type = data.type as LibraryItem['type'] | undefined
          // Infer type for older cloud docs missing `type`
          if (!type) {
            if (latex) type = 'equation'
            else if (tableMarkdown) type = 'table'
            else if (imageUrl) type = 'figure'
            else type = 'equation'
          }
          return {
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
        })
        set({ items, source: 'firestore', loading: false })
        return
      }
    } catch {
      // Offline / rules not ready — fall back to seed
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
