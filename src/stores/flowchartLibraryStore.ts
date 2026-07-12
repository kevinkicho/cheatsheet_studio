import { create } from 'zustand'
import {
  createUserFlowchart,
  deleteUserFlowchart,
  listUserFlowcharts,
  updateUserFlowchart,
  type StoredFlowchart,
} from '@/lib/flowchartLibrary'
import { formatFirestoreError } from '@/lib/firestoreSanitize'
import type { MermaidDiagramKind, MermaidFlowDirection } from '@/types'

interface FlowchartLibraryState {
  items: StoredFlowchart[]
  loading: boolean
  saving: boolean
  error: string | null
  /** Currently linked library id (after save/load), if any. */
  activeId: string | null
  load: (uid: string) => Promise<void>
  saveNew: (
    uid: string,
    input: {
      title: string
      mermaidSource: string
      mermaidKind?: MermaidDiagramKind
      mermaidDirection?: MermaidFlowDirection
    },
  ) => Promise<StoredFlowchart | null>
  saveOverwrite: (
    uid: string,
    id: string,
    input: {
      title: string
      mermaidSource: string
      mermaidKind?: MermaidDiagramKind
      mermaidDirection?: MermaidFlowDirection
    },
  ) => Promise<boolean>
  remove: (uid: string, id: string) => Promise<boolean>
  setActiveId: (id: string | null) => void
  clearError: () => void
  reset: () => void
}

export const useFlowchartLibraryStore = create<FlowchartLibraryState>(
  (set) => ({
    items: [],
    loading: false,
    saving: false,
    error: null,
    activeId: null,

    load: async (uid) => {
      set({ loading: true, error: null })
      try {
        const items = await listUserFlowcharts(uid)
        set({ items, loading: false })
      } catch (e) {
        set({
          loading: false,
          error: formatFirestoreError(e),
          items: [],
        })
      }
    },

    saveNew: async (uid, input) => {
      set({ saving: true, error: null })
      try {
        const created = await createUserFlowchart(uid, input)
        set((s) => ({
          items: [created, ...s.items],
          saving: false,
          activeId: created.id,
        }))
        return created
      } catch (e) {
        set({ saving: false, error: formatFirestoreError(e) })
        return null
      }
    },

    saveOverwrite: async (_uid, id, input) => {
      set({ saving: true, error: null })
      try {
        await updateUserFlowchart(id, input)
        const now = Date.now()
        set((s) => ({
          items: s.items
            .map((it) =>
              it.id === id
                ? {
                    ...it,
                    title: input.title.trim() || it.title,
                    mermaidSource: input.mermaidSource,
                    mermaidKind: input.mermaidKind ?? it.mermaidKind,
                    mermaidDirection:
                      input.mermaidDirection ?? it.mermaidDirection,
                    updatedAt: now,
                  }
                : it,
            )
            .sort((a, b) => b.updatedAt - a.updatedAt),
          saving: false,
          activeId: id,
        }))
        return true
      } catch (e) {
        set({ saving: false, error: formatFirestoreError(e) })
        return false
      }
    },

    remove: async (_uid, id) => {
      set({ saving: true, error: null })
      try {
        await deleteUserFlowchart(id)
        set((s) => ({
          items: s.items.filter((it) => it.id !== id),
          saving: false,
          activeId: s.activeId === id ? null : s.activeId,
        }))
        return true
      } catch (e) {
        set({ saving: false, error: formatFirestoreError(e) })
        return false
      }
    },

    setActiveId: (id) => set({ activeId: id }),
    clearError: () => set({ error: null }),
    reset: () =>
      set({
        items: [],
        loading: false,
        saving: false,
        error: null,
        activeId: null,
      }),
  }),
)
