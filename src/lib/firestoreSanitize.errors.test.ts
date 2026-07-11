import { describe, expect, it } from 'vitest'
import { formatFirestoreError } from '@/lib/firestoreSanitize'

describe('formatFirestoreError', () => {
  it('maps known codes', () => {
    expect(formatFirestoreError({ code: 'permission-denied' })).toMatch(
      /Permission denied/i,
    )
    expect(formatFirestoreError({ code: 'failed-precondition' })).toMatch(
      /index/i,
    )
    expect(formatFirestoreError({ code: 'unavailable' })).toMatch(
      /unavailable/i,
    )
    expect(formatFirestoreError({ code: 'not-found' })).toMatch(/not found/i)
  })

  it('maps message patterns', () => {
    expect(formatFirestoreError({ message: 'Missing index for query' })).toMatch(
      /index/i,
    )
    expect(formatFirestoreError({ message: 'Cannot use undefined' })).toMatch(
      /undefined field/i,
    )
  })

  it('truncates long messages', () => {
    const msg = 'x'.repeat(300)
    const out = formatFirestoreError({ message: msg })
    expect(out.length).toBeLessThanOrEqual(181)
    expect(out.endsWith('…')).toBe(true)
  })

  it('handles non-objects', () => {
    expect(formatFirestoreError(null)).toMatch(/Unknown/)
    expect(formatFirestoreError('boom')).toMatch(/Unknown/)
  })
})
