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
          const data = d.data()
          return {
            id: d.id,
            type: data.type,
            title: data.title,
            subject: data.subject,
            topic: data.topic,
            tags: data.tags ?? [],
            latex: data.latex,
            tableMarkdown: data.tableMarkdown,
            imageUrl: data.imageUrl,
            imagePath: data.imagePath,
            description: data.description,
            source: data.source,
            isSystem: data.isSystem ?? false,
            createdBy: data.createdBy,
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
