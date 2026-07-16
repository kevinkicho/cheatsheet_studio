import { describe, expect, it } from 'vitest'
import {
  buildTopicInventory,
  countsBySubject,
  thinTopics,
} from './catalogInventory'
import type { LibraryItem } from '@/types'

function item(
  id: string,
  subject: LibraryItem['subject'],
  topic: string,
): LibraryItem {
  return {
    id,
    type: 'equation',
    title: id,
    subject,
    topic,
    tags: [],
    latex: 'x',
  }
}

describe('catalogInventory', () => {
  const items = [
    item('a', 'mathematics', 'Calculus'),
    item('b', 'mathematics', 'Calculus'),
    item('c', 'mathematics', 'Algebra'),
    item('d', 'physics', 'Mechanics'),
  ]

  it('builds topic rows', () => {
    const inv = buildTopicInventory(items)
    expect(inv.find((r) => r.topic === 'Calculus')?.count).toBe(2)
    expect(inv.find((r) => r.topic === 'Algebra')?.count).toBe(1)
  })

  it('finds thin topics', () => {
    const thin = thinTopics(items, 2)
    expect(thin.map((t) => t.topic).sort()).toEqual(['Algebra', 'Mechanics'])
  })

  it('counts by subject', () => {
    expect(countsBySubject(items).mathematics).toBe(3)
    expect(countsBySubject(items).physics).toBe(1)
  })
})
