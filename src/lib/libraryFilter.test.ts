import { describe, expect, it } from 'vitest'
import {
  filterLibraryItems,
  itemMatchesSearch,
  searchTokens,
  stripLatexCommands,
  titleStartsWithToken,
} from '@/lib/libraryFilter'
import type { LibraryItem } from '@/types'

function item(
  partial: Partial<LibraryItem> & Pick<LibraryItem, 'id' | 'title'>,
): LibraryItem {
  return {
    type: 'equation',
    subject: 'mathematics',
    topic: 'Algebra',
    tags: [],
    isSystem: true,
    latex: 'x',
    ...partial,
  }
}

describe('libraryFilter', () => {
  it('searchTokens splits on whitespace', () => {
    expect(searchTokens('  Quadratic  formula ')).toEqual([
      'quadratic',
      'formula',
    ])
  })

  it('stripLatexCommands removes \\frac', () => {
    expect(stripLatexCommands('\\frac{1}{2}')).toBe('1 2')
  })

  it('titleStartsWithToken ignores leading punctuation', () => {
    expect(titleStartsWithToken("Bayes' Theorem", 'b')).toBe(true)
    expect(titleStartsWithToken('U-substitution', 'u')).toBe(true)
    expect(titleStartsWithToken('Cobb–Douglas Utility', 'u')).toBe(false)
  })

  it('single letter u matches titles starting with U only', () => {
    const usub = item({ id: 'usub', title: 'u-Substitution' })
    const unit = item({
      id: 'unit',
      title: 'Unit Circle',
      type: 'figure',
      latex: undefined,
      imageUrl: 'data:image/svg+xml,',
    })
    const utility = item({ id: 'util', title: 'Cobb–Douglas Utility' })
    const mrs = item({
      id: 'mrs',
      title: 'Marginal Rate of Substitution',
      tags: ['utility'],
    })
    const okun = item({
      id: 'okun',
      title: "Okun's Law (approx.)",
      tags: ['unemployment', 'macro'],
    })

    expect(itemMatchesSearch(usub, 'u')).toBe(true)
    expect(itemMatchesSearch(unit, 'u')).toBe(true)
    expect(itemMatchesSearch(utility, 'u')).toBe(false)
    expect(itemMatchesSearch(mrs, 'u')).toBe(false)
    expect(itemMatchesSearch(okun, 'u')).toBe(false)

    const hits = filterLibraryItems(
      [utility, mrs, okun, unit, usub],
      { search: 'u' },
    )
    expect(hits.map((i) => i.id).sort()).toEqual(['unit', 'usub'].sort())
    // Title-prefix rank: both start with u; alphabetical Unit before u-Sub? 
    // "Unit" vs "u-sub" - localeCompare: Unit Circle vs u-Substitution
    expect(hits[0]!.title.toLowerCase().startsWith('u')).toBe(true)
  })

  it('gauss still matches single letter g', () => {
    const gauss = item({ id: 'gauss', title: "Gauss's Law (electric)" })
    expect(itemMatchesSearch(gauss, 'g')).toBe(true)
  })

  it('longer query can match mid-title and tags', () => {
    const utility = item({ id: 'util', title: 'Cobb–Douglas Utility' })
    expect(itemMatchesSearch(utility, 'utility')).toBe(true)
    expect(itemMatchesSearch(utility, 'cobb')).toBe(true)
  })

  it('multi-token requires all tokens', () => {
    const it = item({
      id: '1',
      title: 'Quadratic Formula',
      tags: ['roots'],
    })
    expect(itemMatchesSearch(it, 'quadratic formula')).toBe(true)
    expect(itemMatchesSearch(it, 'quadratic missing')).toBe(false)
  })
})
