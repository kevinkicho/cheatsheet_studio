/**
 * Inventory helpers: summarize subjects/topics from library items.
 */
import type { LibraryItem, Subject } from '../types'
import type { TopicInventoryRow } from './catalogTypes'

const SUBJECTS: Subject[] = [
  'mathematics',
  'physics',
  'chemistry',
  'biology',
  'economics',
  'finance',
  'psychology',
  'general',
]

export function listSubjects(): Subject[] {
  return [...SUBJECTS]
}

export function buildTopicInventory(items: LibraryItem[]): TopicInventoryRow[] {
  const map = new Map<string, TopicInventoryRow>()
  for (const it of items) {
    const subject = it.subject ?? 'mathematics'
    const topic = (it.topic || 'General').trim() || 'General'
    const key = `${subject}::${topic}`
    let row = map.get(key)
    if (!row) {
      row = { subject, topic, count: 0, types: {} }
      map.set(key, row)
    }
    row.count++
    const t = it.type || 'equation'
    row.types[t] = (row.types[t] ?? 0) + 1
  }
  return [...map.values()].sort(
    (a, b) =>
      a.subject.localeCompare(b.subject) ||
      a.topic.localeCompare(b.topic, undefined, { numeric: true }),
  )
}

export function thinTopics(
  items: LibraryItem[],
  minCount = 4,
): TopicInventoryRow[] {
  return buildTopicInventory(items).filter((r) => r.count < minCount)
}

export function countsBySubject(
  items: LibraryItem[],
): Partial<Record<Subject, number>> {
  const out: Partial<Record<Subject, number>> = {}
  for (const it of items) {
    const s = it.subject ?? 'mathematics'
    out[s] = (out[s] ?? 0) + 1
  }
  return out
}

export function existingTitlesInTopic(
  items: LibraryItem[],
  subject: Subject,
  topic: string,
): string[] {
  return items
    .filter(
      (i) =>
        i.subject === subject &&
        (i.topic || 'General').toLowerCase() === topic.toLowerCase(),
    )
    .map((i) => i.title)
    .filter(Boolean)
}
