/**
 * Shared catalog snapshot types — RTDB bulk load + Ollama enrichment.
 */
import type { LibraryItem, Subject } from '../types'

export type CatalogSource = 'seed' | 'rtdb' | 'firestore' | 'merged'

export type CatalogMeta = {
  version: number
  updatedAt: number
  itemCount: number
  source: CatalogSource | 'enrich'
  model?: string
  /** Human-readable note from last enrich/publish. */
  note?: string
  bySubject?: Partial<Record<Subject, number>>
}

export type CatalogSnapshot = {
  meta: CatalogMeta
  items: LibraryItem[]
}

export type TopicInventoryRow = {
  subject: Subject
  topic: string
  count: number
  types: Partial<Record<string, number>>
}

export type EnrichProposalItem = {
  /** Temporary id; client assigns stable id on accept. */
  title: string
  type: LibraryItem['type']
  subject: Subject
  topic: string
  tags?: string[]
  latex?: string
  tableMarkdown?: string
  description?: string
  term?: string
  body?: string
  listItems?: string[]
  listOrdered?: boolean
  calloutVariant?: LibraryItem['calloutVariant']
  code?: string
  codeLanguage?: string
  symbol?: string
  value?: string
  unit?: string
  identities?: string[]
  matrixRows?: string[][]
}

/** Built-in subjects shown as chips (+ AI may add more freely). */
export const ENRICH_SUBJECTS: Subject[] = [
  'mathematics',
  'physics',
  'chemistry',
  'biology',
  'economics',
  'finance',
  'psychology',
  'general',
]

export type CatalogChatAction =
  | {
      type: 'enrich_topic'
      subject: Subject
      topic: string
      count: number
      customUserPrompt?: string
      summary: string
    }
  | {
      type: 'create_subject_pack'
      subject: Subject
      topics: string[]
      cardsPerTopic: number
      customUserPrompt?: string
      summary: string
    }
  | {
      type: 'publish_rtdb'
      summary: string
    }
  | {
      type: 'open_catalog'
      summary: string
    }
  | {
      type: 'chat'
      summary: string
      reply: string
    }

export type EnrichResult = {
  model: string
  proposals: EnrichProposalItem[]
  target: { subject: Subject; topic: string; priorCount: number }
  rawNote?: string
}
