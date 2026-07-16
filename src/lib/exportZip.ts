/**
 * Minimal store-only ZIP (no compression) for multipage PNG/JPEG exports.
 * Avoids browser multi-download blockers after async work (Chromium often
 * silently drops 2nd+ blob downloads once the user-gesture token expires).
 */

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2)
  b[0] = n & 0xff
  b[1] = (n >>> 8) & 0xff
  return b
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4)
  b[0] = n & 0xff
  b[1] = (n >>> 8) & 0xff
  b[2] = (n >>> 16) & 0xff
  b[3] = (n >>> 24) & 0xff
  return b
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0
  for (const p of parts) len += p.length
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function encodeName(name: string): Uint8Array {
  // ZIP UTF-8 flag — keep ASCII-safe names from sanitizeExportFilename
  return new TextEncoder().encode(name.replace(/\\/g, '/'))
}

export type ZipEntry = { name: string; data: Uint8Array }

/**
 * Build an uncompressed ZIP archive from named file entries.
 */
export function buildZipStore(entries: ZipEntry[]): Blob {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const ent of entries) {
    const name = encodeName(ent.name)
    const data = ent.data
    const crc = crc32(data)
    const size = data.length

    const local = concat([
      u32(0x04034b50), // local file header
      u16(20), // version needed
      u16(0x0800), // UTF-8 general purpose bit
      u16(0), // store
      u16(0), // time
      u16(0), // date
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0), // extra
      name,
      data,
    ])
    locals.push(local)

    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ])
    centrals.push(central)
    offset += local.length
  }

  const centralDir = concat(centrals)
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ])

  const bytes = concat([...locals, centralDir, end])
  // Copy into a plain ArrayBuffer for BlobPart typing (TS 5.x / DOM lib)
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  return new Blob([ab], { type: 'application/zip' })
}

export async function zipBlobs(
  files: Array<{ name: string; blob: Blob }>,
): Promise<Blob> {
  const entries: ZipEntry[] = []
  for (const f of files) {
    const buf = new Uint8Array(await f.blob.arrayBuffer())
    entries.push({ name: f.name, data: buf })
  }
  return buildZipStore(entries)
}
