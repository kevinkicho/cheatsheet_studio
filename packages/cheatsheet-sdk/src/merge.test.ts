import { describe, expect, it } from 'vitest'
import { createSheet } from './builder'
import { mergeSheets } from './merge'
import { validateSheetDocument } from './validate'

describe('mergeSheets', () => {
  it('combines items from two sheets', () => {
    const a = createSheet({ title: 'A' }).addEquation({ latex: '1' }).build()
    const b = createSheet({ title: 'B' }).addEquation({ latex: '2' }).build()
    const m = mergeSheets([a, b], { title: 'AB' })
    expect(m.title).toBe('AB')
    expect(m.items).toHaveLength(2)
    expect(validateSheetDocument(m).ok).toBe(true)
    // ids remapped — no collision
    expect(new Set(m.items.map((i) => i.id)).size).toBe(2)
  })
})
