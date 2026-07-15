/** True if any run of panel A overlaps any run of panel B. */
export function panelRunsOverlap(
  a: {
    x: number
    y: number
    width: number
    height: number
    runs?: Array<{ x: number; y: number; width: number; height: number }>
  },
  b: {
    x: number
    y: number
    width: number
    height: number
    runs?: Array<{ x: number; y: number; width: number; height: number }>
  },
  eps = 0.5,
): boolean {
  const runsA =
    a.runs && a.runs.length > 0
      ? a.runs
      : [{ x: a.x, y: a.y, width: a.width, height: a.height }]
  const runsB =
    b.runs && b.runs.length > 0
      ? b.runs
      : [{ x: b.x, y: b.y, width: b.width, height: b.height }]
  for (const ra of runsA) {
    for (const rb of runsB) {
      if (rectsOverlap(ra, rb, eps)) return true
    }
  }
  return false
}

/** Closed rectangle perimeter as M/L edge segments (absolute board px). */
export function rectPerimeterPathD(
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  if (w < 1 || h < 1) return ''
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  const x1 = Math.round(x + w)
  const y1 = Math.round(y + h)
  return [
    `M ${x0} ${y0} L ${x1} ${y0}`,
    `M ${x1} ${y0} L ${x1} ${y1}`,
    `M ${x1} ${y1} L ${x0} ${y1}`,
    `M ${x0} ${y1} L ${x0} ${y0}`,
  ].join(' ')
}

/** Axis-aligned rect overlap (eps shrinks both sides). */
export function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  eps = 0.5,
): boolean {
  return (
    a.x + a.width > b.x + eps &&
    b.x + b.width > a.x + eps &&
    a.y + a.height > b.y + eps &&
    b.y + b.height > a.y + eps
  )
}
