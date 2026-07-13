import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearImportHistory,
  loadImportHistory,
  pushImportHistory,
} from './importHistory'

describe('importHistory', () => {
  beforeEach(() => {
    clearImportHistory()
  })

  it('pushes and loads recent imports', () => {
    pushImportHistory({
      title: 'Finance Midterm',
      cardCount: 18,
      mode: 'new',
      fileName: 'finance-midterm.sheet.json',
    })
    const list = loadImportHistory()
    expect(list).toHaveLength(1)
    expect(list[0]!.title).toBe('Finance Midterm')
    expect(list[0]!.cardCount).toBe(18)
  })

  it('caps history length', () => {
    for (let i = 0; i < 20; i++) {
      pushImportHistory({
        title: `Sheet ${i}`,
        cardCount: i,
        mode: 'new',
        fileName: `s${i}.json`,
      })
    }
    expect(loadImportHistory().length).toBeLessThanOrEqual(12)
  })
})
