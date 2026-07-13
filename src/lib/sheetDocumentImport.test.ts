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

  it('rejects missing title', () => {
    const r = parseSheetDocumentJson({
      canvas: {},
      items: [],
    })
    expect(r.ok).toBe(false)
  })
})
