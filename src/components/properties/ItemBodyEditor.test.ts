import { describe, expect, it } from 'vitest'
import {
  matrixRowsToEditor,
  parseMatrixEditor,
} from '@/components/properties/ItemBodyEditor'

describe('matrix editor encode/decode', () => {
  it('round-trips rows', () => {
    const rows = [
      ['a', 'b'],
      ['c', 'd'],
    ]
    const text = matrixRowsToEditor(rows)
    expect(text).toBe('a | b\nc | d')
    expect(parseMatrixEditor(text)).toEqual(rows)
  })

  it('parses sparse cells', () => {
    expect(parseMatrixEditor('1 | 0 | 0\n0 | 1 | 0')).toEqual([
      ['1', '0', '0'],
      ['0', '1', '0'],
    ])
  })
})
