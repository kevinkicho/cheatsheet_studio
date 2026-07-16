/**
 * Fit node label type size to the shape box so short labels don't look
 * tiny in oversized Mermaid layout boxes (screenshot 021358).
 */

/** Rough average glyph width as a fraction of font-size (Trebuchet/Verdana). */
const CHAR_W = 0.56
const LINE_H = 1.15

export type FitLabelOpts = {
  /** Horizontal inset from box edges (px). */
  padX?: number
  /** Vertical inset from box edges (px). */
  padY?: number
  minPx?: number
  maxPx?: number
  /** Pre-split lines; default splits on newlines only. */
  lines?: string[]
}

/**
 * Largest font-size (px) that fits `label` inside width×height with padding.
 */
export function fitLabelFontPx(
  label: string,
  boxW: number,
  boxH: number,
  opts?: FitLabelOpts,
): number {
  const w = Math.max(12, boxW)
  const h = Math.max(12, boxH)
  const padX = opts?.padX ?? 6
  const padY = opts?.padY ?? 4
  const minPx = opts?.minPx ?? 11
  // Grow with the box when caller doesn't cap — enlarged shapes should fill
  // with type, not stop at a fixed 32px ceiling.
  const maxPx =
    opts?.maxPx ??
    Math.min(96, Math.max(32, Math.floor(Math.min(w, h) * 0.45)))
  const availW = Math.max(8, w - padX * 2)
  const availH = Math.max(8, h - padY * 2)

  const lines =
    opts?.lines?.length && opts.lines.length > 0
      ? opts.lines
      : String(label || ' ')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
  const useLines = lines.length > 0 ? lines : [' ']
  const maxChars = Math.max(1, ...useLines.map((l) => l.length))
  const nLines = useLines.length

  // Width constraint: n * CHAR_W * font ≈ availW
  const byWidth = availW / (maxChars * CHAR_W)
  // Height constraint: nLines * LINE_H * font ≈ availH
  const byHeight = availH / (nLines * LINE_H)

  const raw = Math.min(byWidth, byHeight)
  // Prefer slightly larger type when box is tall relative to one line of text
  // (common Mermaid boxes with short labels)
  const boosted =
    nLines === 1 && h > 36 && raw < h * 0.38 ? Math.min(byHeight * 0.92, byWidth) : raw

  return Math.round(Math.min(maxPx, Math.max(minPx, boosted)))
}
