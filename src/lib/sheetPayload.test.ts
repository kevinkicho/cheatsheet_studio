import { describe, expect, it } from 'vitest'
import { buildSheetPayload } from '@/lib/sheetPayload'
import { DEFAULT_CANVAS } from '@/types'

describe('buildSheetPayload', () => {
  it('includes owner, title, canvas, items, folders', () => {
    const now = 1_700_000_000_000
    const payload = buildSheetPayload(
      'uid1',
      'My sheet',
      DEFAULT_CANVAS,
      [],
      now,
      true,
      [],
    ) as Record<string, unknown>
    expect(payload.ownerId).toBe('uid1')
    expect(payload.title).toBe('My sheet')
    expect(payload.updatedAt).toBe(now)
    expect(payload.createdAt).toBe(now)
    expect(payload.canvas).toBeTruthy()
    expect(payload.items).toEqual([])
    expect(payload.folders).toEqual([])
  })

  it('omits createdAt when includeCreatedAt is false', () => {
    const payload = buildSheetPayload(
      'u',
      'T',
      DEFAULT_CANVAS,
      [],
      1,
      false,
    ) as Record<string, unknown>
    expect(payload.createdAt).toBeUndefined()
  })

  it('strips undefined nested fields for Firestore', () => {
    const canvas = {
      ...DEFAULT_CANVAS,
      mystery: undefined,
    } as typeof DEFAULT_CANVAS & { mystery?: undefined }
    const item = {
      id: 'i1',
      type: 'equation' as const,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      zIndex: 1,
      latex: 'x',
      gone: undefined,
    }
    const payload = buildSheetPayload(
      'u',
      'T',
      canvas,
      [item as never],
      1,
      false,
    ) as unknown as {
      canvas: Record<string, unknown>
      items: Record<string, unknown>[]
    }
    expect('mystery' in payload.canvas).toBe(false)
    expect('gone' in payload.items[0]!).toBe(false)
    expect(payload.items[0]!.latex).toBe('x')
  })

  it('preserves gridOpacity 0 on canvas', () => {
    const payload = buildSheetPayload(
      'u',
      'T',
      { ...DEFAULT_CANVAS, gridOpacity: 0 },
      [],
      1,
      false,
    ) as { canvas: { gridOpacity: number } }
    expect(payload.canvas.gridOpacity).toBe(0)
  })
})
