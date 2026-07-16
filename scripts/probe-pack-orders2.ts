import { placeTopicRegionsDense } from './src/lib/autoOrganize/shelf'

function bbox(pos, regions) {
  let cw=0, ch=0
  for (const r of regions) {
    const p = pos.get(r.index)
    cw = Math.max(cw, p.c + r.cw)
    ch = Math.max(ch, p.r + r.ch)
  }
  return { cw, ch, area: cw*ch }
}

// Try random-ish cases to find where height loses
let found = 0
for (let seed = 0; seed < 200 && found < 5; seed++) {
  const n = 5 + (seed % 4)
  const cols = 10 + (seed % 8)
  const regions = []
  let s = seed * 9973
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const cw = 2 + (s % Math.min(6, cols))
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const ch = 2 + (s % 7)
    regions.push({ index: i, cw, ch })
  }
  const heightOnly = placeTopicRegionsDense(regions, cols, 0, { multiOrder: false, sortByHeight: true })
  const best = placeTopicRegionsDense(regions, cols, 0, { multiOrder: true })
  const h = bbox(heightOnly, regions)
  const b = bbox(best, regions)
  if (b.area < h.area - 0.5 || b.ch < h.ch) {
    found++
    console.log('FOUND seed', seed, { cols, regions, height: h, best: b })
  }
}
console.log('found', found)
