import { describe, expect, it } from 'vitest'
import {
  constantToLatex,
  inferLibraryType,
  isLibraryItemType,
  isVectorTextCard,
  libraryPayloadFields,
  matrixRowsToLatex,
  matrixToLatex,
} from '@/lib/cardKinds'
import type { LibraryItem } from '@/types'

describe('cardKinds', () => {
  it('recognizes all library types', () => {
    expect(isLibraryItemType('definition')).toBe(true)
    expect(isLibraryItemType('identity-set')).toBe(true)
    expect(isLibraryItemType('process-chart')).toBe(false)
  })

  it('builds constant latex from fields', () => {
    expect(
      constantToLatex({
        symbol: 'c',
        value: '2.998\\times 10^{8}',
        unit: 'm/s',
      }),
    ).toContain('c =')
    expect(
      constantToLatex({ latex: 'e = 2.718' }),
    ).toBe('e = 2.718')
  })

  it('builds matrix latex from rows', () => {
    expect(
      matrixRowsToLatex([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}')
    expect(
      matrixToLatex({
        matrixRows: [
          ['1', '0'],
          ['0', '1'],
        ],
      }),
    ).toContain('pmatrix')
  })

  it('copies tier payloads from library items', () => {
    const lib: LibraryItem = {
      id: 'x',
      type: 'list',
      title: 'Steps',
      subject: 'mathematics',
      topic: 'General',
      tags: [],
      listItems: ['a', 'b'],
      listOrdered: true,
      isSystem: true,
    }
    const p = libraryPayloadFields(lib)
    expect(p.listItems).toEqual(['a', 'b'])
    expect(p.listOrdered).toBe(true)
    // clone
    p.listItems![0] = 'z'
    expect(lib.listItems![0]).toBe('a')
  })

  it('infers types from payloads', () => {
    expect(inferLibraryType({ code: 'x = 1' })).toBe('code')
    expect(
      inferLibraryType({
        symbol: 'c',
        value: '3e8',
        unit: 'm/s',
      }),
    ).toBe('constant')
    expect(
      inferLibraryType({ identities: ['a=b', 'c=d'] }),
    ).toBe('identity-set')
    expect(inferLibraryType({ term: 'NPV', body: '…' })).toBe('definition')
    expect(inferLibraryType({ listItems: ['one'] })).toBe('list')
    expect(inferLibraryType({ matrixRows: [['1']] })).toBe('matrix')
  })

  it('marks prose + stem structured as vector text', () => {
    expect(isVectorTextCard({ type: 'definition' })).toBe(true)
    expect(isVectorTextCard({ type: 'matrix' })).toBe(true)
    expect(isVectorTextCard({ type: 'code' })).toBe(true)
    expect(isVectorTextCard({ type: 'plot' })).toBe(false)
  })
})
