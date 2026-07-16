/**
 * Pixel-space multi-order leaf packer (shared by sheet hierarchical repack
 * and in-panel dense). Optimized for residual hole fill, not min-height only.
 */

export type PixelLeaf = {
  /** Stable id for result map */
  id: string
  w: number
  h: number
  /** Local card offsets relative to leaf origin (0,0) */
  locals: Array<{ id: string; dx: number; dy: number; w: number; h: number }>
}

export type PixelPackResult = {
  /** Leaf origin in pack coordinates */
  leafOrigin: Map<string, { x: number; y: number }>
  /** Absolute card positions */
  cardPos: Map<string, { x: number; y: number; w: number; h: number }>
  usedW: number
  usedH: number
}

/**
 * Densest free-flow pack of leaf footprints in a band of width `packW`.
 * Origins are relative (0,0) = top-left of band; caller adds packLeft/packTop.
 */
export function packLeavesPixelDense(
  leavesIn: PixelLeaf[],
  packW: number,
  gapPx: number,
): PixelPackResult {
  const empty: PixelPackResult = {
    leafOrigin: new Map(),
    cardPos: new Map(),
    usedW: 1,
    usedH: 1,
  }
  if (leavesIn.length === 0) return empty

  const gap = Math.max(0, Math.round(gapPx))
  const bandW = Math.max(48, Math.round(packW))
  const leaves = leavesIn.map((L) => ({
    ...L,
    w: Math.min(bandW, Math.max(8, Math.round(L.w))),
    h: Math.max(8, Math.round(L.h)),
  }))

  type Placed = { i: number; x: number; y: number; w: number; h: number }
  const idxs = leaves.map((_, i) => i)
  const byH = [...idxs].sort(
    (a, b) =>
      leaves[b]!.h - leaves[a]!.h ||
      leaves[b]!.w * leaves[b]!.h - leaves[a]!.w * leaves[a]!.h,
  )
  const byA = [...idxs].sort(
    (a, b) =>
      leaves[b]!.w * leaves[b]!.h - leaves[a]!.w * leaves[a]!.h ||
      leaves[b]!.h - leaves[a]!.h,
  )
  const byW = [...idxs].sort(
    (a, b) =>
      leaves[b]!.w - leaves[a]!.w || leaves[b]!.h - leaves[a]!.h,
  )
  const byHAsc = [...idxs].sort(
    (a, b) =>
      leaves[a]!.h - leaves[b]!.h || leaves[b]!.w - leaves[a]!.w,
  )
  const byPeri = [...idxs].sort((a, b) => {
    const pa = leaves[a]!.w + leaves[a]!.h
    const pb = leaves[b]!.w + leaves[b]!.h
    return pb - pa || leaves[b]!.h - leaves[a]!.h
  })
  const orderings = [
    byH,
    byA,
    byW,
    byHAsc,
    byPeri,
    idxs,
    [...idxs].reverse(),
  ]

  const collides = (
    placed: Placed[],
    x: number,
    y: number,
    w: number,
    h: number,
    ignore?: number,
  ) => {
    for (const p of placed) {
      if (ignore != null && p.i === ignore) continue
      if (
        x < p.x + p.w + gap &&
        x + w + gap > p.x &&
        y < p.y + p.h + gap &&
        y + h + gap > p.y
      ) {
        return true
      }
    }
    return false
  }

  const contactScore = (
    placed: Placed[],
    x: number,
    y: number,
    w: number,
    h: number,
    ignore?: number,
  ) => {
    let c = 0
    if (x <= 0.5) c += h * 0.5
    if (y <= 0.5) c += w * 0.5
    for (const p of placed) {
      if (ignore != null && p.i === ignore) continue
      const yOl = Math.min(y + h, p.y + p.h) - Math.max(y, p.y)
      if (yOl > 0) {
        if (Math.abs(x - (p.x + p.w + gap)) < 0.6) c += yOl
        if (Math.abs(p.x - (x + w + gap)) < 0.6) c += yOl
      }
      const xOl = Math.min(x + w, p.x + p.w) - Math.max(x, p.x)
      if (xOl > 0) {
        if (Math.abs(y - (p.y + p.h + gap)) < 0.6) c += xOl
        if (Math.abs(p.y - (y + h + gap)) < 0.6) c += xOl
      }
    }
    return c
  }

  const candSets = (placed: Placed[]) => {
    const xCands = new Set<number>([0])
    const yCands = new Set<number>([0])
    for (const p of placed) {
      xCands.add(p.x)
      xCands.add(p.x + p.w + gap)
      yCands.add(p.y)
      yCands.add(p.y + p.h + gap)
    }
    return { xCands, yCands }
  }

  const gravity = (placed: Placed[]) => {
    for (let sweep = 0; sweep < 20; sweep++) {
      let any = false
      for (const p of [...placed].sort((a, b) => a.y - b.y || a.x - b.x)) {
        let lo = 0
        let hi = p.y
        let bestY = p.y
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2)
          if (!collides(placed, p.x, mid, p.w, p.h, p.i)) {
            bestY = mid
            hi = mid - 1
          } else lo = mid + 1
        }
        if (bestY < p.y) {
          p.y = bestY
          any = true
        }
      }
      for (const p of [...placed].sort((a, b) => a.x - b.x || a.y - b.y)) {
        let lo = 0
        let hi = p.x
        let bestX = p.x
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2)
          if (
            mid + p.w <= bandW + 0.5 &&
            !collides(placed, mid, p.y, p.w, p.h, p.i)
          ) {
            bestX = mid
            hi = mid - 1
          } else lo = mid + 1
        }
        if (bestX < p.x) {
          p.x = bestX
          any = true
        }
      }
      if (!any) break
    }
  }

  const voidFill = (placed: Placed[]) => {
    for (let round = 0; round < 6; round++) {
      let any = false
      for (const p of [...placed].sort(
        (a, b) => b.w * b.h - a.w * a.h || b.h - a.h,
      )) {
        const others = placed.filter((o) => o.i !== p.i)
        const { xCands, yCands } = candSets(others)
        let best: { x: number; y: number; score: number } | null = null
        for (const y of [...yCands].sort((a, b) => a - b)) {
          for (const x of [...xCands].sort((a, b) => a - b)) {
            if (x + p.w > bandW + 0.5) continue
            if (collides(others, x, y, p.w, p.h)) continue
            const contact = contactScore(others, x, y, p.w, p.h)
            // Density-first: top-left + contact (not global bottom*1e9)
            const score = y * 1e7 + x * 200 - contact * 8e3
            if (!best || score < best.score) best = { x, y, score }
          }
        }
        if (best && (best.x !== p.x || best.y !== p.y)) {
          const cur =
            p.y * 1e7 +
            p.x * 200 -
            contactScore(others, p.x, p.y, p.w, p.h) * 8e3
          if (best.score < cur - 1) {
            p.x = best.x
            p.y = best.y
            any = true
          }
        }
      }
      if (!any) break
      gravity(placed)
    }
  }

  const placeOnce = (order: number[]): Placed[] => {
    const placed: Placed[] = []
    for (const i of order) {
      const L = leaves[i]!
      const w = L.w
      const h = L.h
      const { xCands, yCands } = candSets(placed)
      let best: { x: number; y: number; score: number } | null = null
      // Always include 0,0 and scan a dense candidate set
      const ys = new Set([...yCands, 0])
      const xs = new Set([...xCands, 0])
      // Fine scan every 4px on first few for holes (band limited)
      if (placed.length > 0 && placed.length < 14) {
        const bot = Math.max(...placed.map((p) => p.y + p.h), 0)
        for (let y = 0; y <= bot + h; y += 4) ys.add(y)
        for (let x = 0; x <= bandW - w; x += 4) xs.add(x)
      }
      for (const y of [...ys].sort((a, b) => a - b)) {
        for (const x of [...xs].sort((a, b) => a - b)) {
          if (x + w > bandW + 0.5) continue
          if (collides(placed, x, y, w, h)) continue
          const contact = contactScore(placed, x, y, w, h)
          const bottom = Math.max(
            placed.reduce((m, p) => Math.max(m, p.y + p.h), 0),
            y + h,
          )
          const score =
            y * 1e7 + x * 200 - contact * 8e3 + bottom * 30
          if (!best || score < best.score) best = { x, y, score }
        }
      }
      if (!best) {
        const y =
          placed.length === 0
            ? 0
            : Math.max(...placed.map((p) => p.y + p.h)) + gap
        best = { x: 0, y, score: y }
      }
      placed.push({ i, x: best.x, y: best.y, w, h })
    }
    gravity(placed)
    voidFill(placed)
    gravity(placed)
    voidFill(placed)
    gravity(placed)
    return placed
  }

  const scorePlaced = (placed: Placed[]) => {
    let usedW = 1
    let usedH = 1
    let filled = 0
    for (const p of placed) {
      usedW = Math.max(usedW, p.x + p.w)
      usedH = Math.max(usedH, p.y + p.h)
      filled += p.w * p.h
    }
    usedW = Math.min(bandW, usedW)
    const box = Math.max(1, usedW * usedH)
    const fill = Math.min(1, filled / box)
    const emptyTax = (1 - fill) * (1 - fill) * 3e6
    return emptyTax + usedH * 4e5 + box * 4
  }

  let bestPlaced: Placed[] | null = null
  let bestScore = Infinity
  for (const order of orderings) {
    const placed = placeOnce(order)
    const sc = scorePlaced(placed)
    if (sc < bestScore) {
      bestScore = sc
      bestPlaced = placed
    }
  }

  const placed = bestPlaced ?? placeOnce(byH)
  const leafOrigin = new Map<string, { x: number; y: number }>()
  const cardPos = new Map<string, { x: number; y: number; w: number; h: number }>()
  let usedW = 1
  let usedH = 1
  for (const p of placed) {
    const L = leaves[p.i]!
    leafOrigin.set(L.id, { x: p.x, y: p.y })
    usedW = Math.max(usedW, p.x + p.w)
    usedH = Math.max(usedH, p.y + p.h)
    for (const loc of L.locals) {
      cardPos.set(loc.id, {
        x: p.x + loc.dx,
        y: p.y + loc.dy,
        w: loc.w,
        h: loc.h,
      })
    }
  }
  return {
    leafOrigin,
    cardPos,
    usedW: Math.min(bandW, usedW),
    usedH: Math.max(1, usedH),
  }
}
