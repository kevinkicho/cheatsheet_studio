import { parseGIF, decompressFrames, type ParsedFrame } from 'gifuct-js'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'

/**
 * Bake a seamless forward+reverse GIF from an input GIF blob.
 * Frames play 0…n then n−1…1 so a normal <img> loop has no hard jump.
 * Processing happens in the browser from a local File/Blob (no Storage CORS).
 */
export async function bakePingPongGif(source: Blob): Promise<Blob> {
  const buf = await source.arrayBuffer()
  const gif = parseGIF(buf)
  const raw = decompressFrames(gif, true)
  if (raw.length === 0) throw new Error('GIF has no frames')

  const width = gif.lsd.width || raw[0]!.dims.width
  const height = gif.lsd.height || raw[0]!.dims.height
  if (!width || !height) throw new Error('Invalid GIF size')

  const fullFrames = compositeFullFrames(raw, width, height)
  if (fullFrames.length === 0) throw new Error('Could not composite GIF frames')

  const order: number[] = []
  for (let i = 0; i < fullFrames.length; i++) order.push(i)
  if (fullFrames.length > 1) {
    for (let i = fullFrames.length - 2; i >= 1; i--) order.push(i)
  }

  const encoder = GIFEncoder()
  for (let oi = 0; oi < order.length; oi++) {
    const frame = fullFrames[order[oi]!]!
    const rgba = frame.imageData.data
    const palette = quantize(rgba, 256)
    const index = applyPalette(rgba, palette)
    const delayCs = Math.max(2, Math.round(frame.delayMs / 10))
    encoder.writeFrame(index, width, height, {
      palette,
      delay: delayCs,
      first: oi === 0,
    })
  }
  encoder.finish()
  const bytes = encoder.bytes()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'image/gif' })
}

type FullFrame = { imageData: ImageData; delayMs: number }

function compositeFullFrames(
  frames: ParsedFrame[],
  width: number,
  height: number,
): FullFrame[] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true })
  if (!ctx) return []

  const temp = document.createElement('canvas')
  const tctx = temp.getContext('2d', { alpha: true })
  if (!tctx) return []

  const out: FullFrame[] = []
  let prevDisposal = 0
  let prevDims = { left: 0, top: 0, width: 0, height: 0 }
  let previousFull: ImageData | null = null

  for (const frame of frames) {
    if (out.length > 0) {
      if (prevDisposal === 2) {
        ctx.clearRect(
          prevDims.left,
          prevDims.top,
          prevDims.width,
          prevDims.height,
        )
      } else if (prevDisposal === 3 && previousFull) {
        ctx.putImageData(previousFull, 0, 0)
      }
    }

    const beforeDraw =
      frame.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null

    const { left, top, width: fw, height: fh } = frame.dims
    if (fw > 0 && fh > 0 && frame.patch?.length) {
      temp.width = fw
      temp.height = fh
      tctx.putImageData(
        new ImageData(new Uint8ClampedArray(frame.patch), fw, fh),
        0,
        0,
      )
      ctx.drawImage(temp, left, top)
    }

    const imageData = ctx.getImageData(0, 0, width, height)
    const delayMs = Math.max(20, frame.delay > 0 ? frame.delay : 100)
    out.push({ imageData, delayMs })

    previousFull = beforeDraw
    prevDisposal = frame.disposalType ?? 0
    prevDims = { left, top, width: fw, height: fh }
  }

  return out
}

export function blobLooksLikeGif(file: Blob, name?: string): boolean {
  if (file.type && file.type.toLowerCase().includes('gif')) return true
  if (name?.toLowerCase().endsWith('.gif')) return true
  return false
}
