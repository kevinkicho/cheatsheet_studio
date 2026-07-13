import { describe, expect, it } from 'vitest'
import { parseSheetDocumentJson } from './sheetDocumentImport'

describe('parseSheetDocumentJson', () => {
  it('accepts a minimal valid agent sheet', () => {
    const r = parseSheetDocumentJson({
      v: 1,
      title: 'Import me',
      canvas: { width: 900, height: 1100 },
      items: [
        {
          id: 'e1',
          type: 'equation',
          x: 10,
          y: 20,
          width: 200,
          height: 80,
          zIndex: 1,
          latex: '1+1',
        },
      ],
      folders: [],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.sheet.title).toBe('Import me')
      expect(r.sheet.items).toHaveLength(1)
      expect(r.sheet.items[0]!.latex).toBe('1+1')
    }
  })

  it('rejects missing title with a friendly hint', () => {
    const r = parseSheetDocumentJson({
      canvas: {},
      items: [],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.toLowerCase()).toMatch(/title/)
    }
  })

  it('rejects missing items with agent-oriented guidance', () => {
    const r = parseSheetDocumentJson({
      title: 'Almost',
      canvas: {},
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/items/i)
    }
  })

  it('rejects bad card geometry with card identity in the message', () => {
    const r = parseSheetDocumentJson({
      title: 'Bad card',
      canvas: {},
      items: [
        {
          id: 'broken',
          type: 'equation',
          x: 'left',
          y: 0,
          width: 100,
          height: 40,
        },
      ],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/broken/)
      expect(r.error).toMatch(/x/i)
    }
  })
})
