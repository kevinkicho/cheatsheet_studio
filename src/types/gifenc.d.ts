declare module 'gifenc' {
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {
      format?: 'rgb565' | 'rgb444' | 'rgba4444'
      oneBitAlpha?: boolean | number
      clearAlpha?: boolean
      clearAlphaThreshold?: number
      clearAlphaColor?: number
    },
  ): number[][]

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: string,
  ): Uint8Array

  export interface GIFEncoderOptions {
    auto?: boolean
    initialCapacity?: number
  }

  export interface WriteFrameOptions {
    palette?: number[][]
    first?: boolean
    transparent?: boolean
    transparentIndex?: number
    delay?: number
    dispose?: number
    repeat?: number
  }

  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: WriteFrameOptions,
    ): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    buffer: ArrayBuffer
    stream: { buffer: ArrayBuffer }
  }

  export function GIFEncoder(opts?: GIFEncoderOptions): GIFEncoderInstance
}
