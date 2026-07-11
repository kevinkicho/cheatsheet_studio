import { describe, expect, it } from 'vitest'
import { createId } from '@/lib/ids'

describe('createId', () => {
  it('returns unique non-empty ids', () => {
    const a = createId()
    const b = createId()
    expect(a.length).toBeGreaterThan(4)
    expect(a).not.toBe(b)
  })

  it('supports optional prefix', () => {
    const id = createId('local')
    expect(id.startsWith('local_')).toBe(true)
  })
})
