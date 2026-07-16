/**
 * Cross-UI coordination: FAB chat ↔ Catalog & enrich panel.
 */
import { create } from 'zustand'
import type { EnrichProposalItem } from '@/lib/catalogTypes'
import type { Subject } from '@/types'

export type InjectedEnrichDraft = {
  proposals: EnrichProposalItem[]
  subject: Subject
  topic: string
  model?: string
  note?: string
  /** If true, open review modal immediately */
  openReview?: boolean
}

type CatalogUiState = {
  /** Bump to force left sidebar Catalog section open */
  catalogOpenTick: number
  requestOpenCatalog: () => void

  injectedDraft: InjectedEnrichDraft | null
  injectDraft: (d: InjectedEnrichDraft) => void
  consumeInjectedDraft: () => InjectedEnrichDraft | null
}

export const useCatalogUiStore = create<CatalogUiState>((set, get) => ({
  catalogOpenTick: 0,
  requestOpenCatalog: () =>
    set((s) => ({ catalogOpenTick: s.catalogOpenTick + 1 })),

  injectedDraft: null,
  injectDraft: (d) => set({ injectedDraft: d }),
  consumeInjectedDraft: () => {
    const d = get().injectedDraft
    set({ injectedDraft: null })
    return d
  },
}))
