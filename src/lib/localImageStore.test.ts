import { describe, expect, it } from 'vitest'
import {
  isEphemeralBlobUrl,
  isLocalAssetRef,
  isPersistentImageUrl,
  LOCAL_ASSET_PREFIX,
} from '@/lib/localImageStore'

describe('local image URL helpers', () => {
  it('detects local-asset refs', () => {
    expect(isLocalAssetRef(`${LOCAL_ASSET_PREFIX}abc`)).toBe(true)
    expect(isLocalAssetRef('https://x.com/a.png')).toBe(false)
    expect(isLocalAssetRef(null)).toBe(false)
    expect(isLocalAssetRef('')).toBe(false)
  })

  it('detects ephemeral blob URLs', () => {
    expect(isEphemeralBlobUrl('blob:http://localhost/uuid')).toBe(true)
    expect(isEphemeralBlobUrl('https://x.com/a.png')).toBe(false)
  })

  it('persistent URLs exclude blob: and allow https/data/local-asset', () => {
    expect(isPersistentImageUrl('blob:http://x')).toBe(false)
    expect(isPersistentImageUrl('https://cdn.example/a.png')).toBe(true)
    expect(isPersistentImageUrl('http://cdn.example/a.png')).toBe(true)
    expect(isPersistentImageUrl('data:image/png;base64,xx')).toBe(true)
    expect(isPersistentImageUrl(`${LOCAL_ASSET_PREFIX}id`)).toBe(true)
    expect(isPersistentImageUrl(undefined)).toBe(false)
  })
})
