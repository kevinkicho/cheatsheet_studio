import { describe, expect, it } from 'vitest'
import { buildZipStore, zipBlobs } from '@/lib/exportZip'

describe('buildZipStore', () => {
  it('builds a readable ZIP with local + central headers', async () => {
    const data = new TextEncoder().encode('hello export')
    const zip = buildZipStore([{ name: 'page-p1.png', data }])
    expect(zip.type).toBe('application/zip')
    expect(zip.size).toBeGreaterThan(data.length + 30)

    const buf = new Uint8Array(await zip.arrayBuffer())
    // Local file header signature PK\x03\x04
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
    expect(buf[2]).toBe(0x03)
    expect(buf[3]).toBe(0x04)
    // End of central directory signature near end
    const last = buf.length - 22
    expect(buf[last]).toBe(0x50)
    expect(buf[last + 1]).toBe(0x4b)
    expect(buf[last + 2]).toBe(0x05)
    expect(buf[last + 3]).toBe(0x06)
  })

  it('zipBlobs packs multiple files', async () => {
    const zip = await zipBlobs([
      { name: 'a.png', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) },
      { name: 'b.jpg', blob: new Blob([new Uint8Array([4, 5])], { type: 'image/jpeg' }) },
    ])
    expect(zip.size).toBeGreaterThan(40)
  })
})
