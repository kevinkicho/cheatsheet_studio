/** Merge occupied cells into horizontal runs (for L-shaped panel chrome). */
export function cellsToOrthogonalRuns(
  cells: Array<{ c: number; r: number; cw: number; ch: number }>,
  grid: number,
  originX: number,
  originY: number,
  padPx: number,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (cells.length === 0) return []
  // Expand to unit cells
  const unit = new Set<string>()
  for (const cell of cells) {
    for (let r = cell.r; r < cell.r + cell.ch; r++) {
      for (let c = cell.c; c < cell.c + cell.cw; c++) {
        unit.add(`${c},${r}`)
      }
    }
  }
  // Group by row → contiguous c ranges
  const byRow = new Map<number, number[]>()
  for (const k of unit) {
    const [cs, rs] = k.split(',')
    const c = Number(cs)
    const r = Number(rs)
    if (!byRow.has(r)) byRow.set(r, [])
    byRow.get(r)!.push(c)
  }
  const runs: Array<{ x: number; y: number; width: number; height: number }> =
    []
  const pad = Math.max(0, padPx)
  for (const [r, cols] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    cols.sort((a, b) => a - b)
    let start = cols[0]!
    let prev = cols[0]!
    for (let i = 1; i <= cols.length; i++) {
      const cur = cols[i]
      if (cur === prev + 1) {
        prev = cur
        continue
      }
      // emit [start, prev]
      const c0 = start
      const c1 = prev
      runs.push({
        x: Math.round(originX + c0 * grid - pad),
        y: Math.round(originY + r * grid - pad),
        width: Math.round((c1 - c0 + 1) * grid + pad * 2),
        height: Math.round(grid + pad * 2),
      })
      if (cur != null) {
        start = cur
        prev = cur
      }
    }
  }
  // Merge vertically adjacent identical runs (optional tidy)
  return mergeVerticalRuns(runs)
}

function mergeVerticalRuns(
  runs: Array<{ x: number; y: number; width: number; height: number }>,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (runs.length <= 1) return runs
  const sorted = [...runs].sort((a, b) => a.x - b.x || a.y - b.y)
  const out: typeof runs = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (
      last &&
      last.x === r.x &&
      last.width === r.width &&
      last.y + last.height >= r.y - 1 &&
      last.y + last.height <= r.y + 1
    ) {
      last.height = r.y + r.height - last.y
    } else {
      out.push({ ...r })
    }
  }
  return out
}
