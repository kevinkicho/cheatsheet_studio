import { describe, expect, it } from 'vitest'
import { stripUndefined } from '@/lib/firestoreSanitize'

describe('stripUndefined (Firestore payloads)', () => {
  it('removes undefined keys but keeps null and 0', () => {
    const out = stripUndefined({
      a: 1,
      b: undefined,
      c: null,
      d: 0,
      nested: { x: undefined, y: 2 },
    })
    expect(out).toEqual({
      a: 1,
      c: null,
      d: 0,
      nested: { y: 2 },
    })
  })

  it('preserves gridOpacity 0 (valid full-transparent grid)', () => {
    const out = stripUndefined({
      canvas: { gridOpacity: 0, showGrid: true },
    })
    expect(out).toEqual({
      canvas: { gridOpacity: 0, showGrid: true },
    })
  })
})
