import { describe, expect, it } from 'vitest'
import { blobLooksLikeGif } from '@/lib/gifPingPongBake'

describe('blobLooksLikeGif', () => {
  it('uses mime type when present', () => {
    expect(blobLooksLikeGif(new Blob([], { type: 'image/gif' }))).toBe(true)
    expect(blobLooksLikeGif(new Blob([], { type: 'image/png' }))).toBe(false)
  })

  it('falls back to file name extension', () => {
    expect(
      blobLooksLikeGif(new Blob([], { type: '' }), 'loop.GIF'),
    ).toBe(true)
    expect(
      blobLooksLikeGif(new Blob([], { type: '' }), 'photo.jpg'),
    ).toBe(false)
  })
})
