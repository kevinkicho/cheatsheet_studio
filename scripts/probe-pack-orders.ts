import { placeTopicRegionsDense } from '../src/lib/autoOrganize/shelf'

function bbox(
  pos: Map<number, { c: number; r: number }>,
  regions: Array<{ index: number; cw: number; ch: number }>,
) {
  let cw = 0
  let ch = 0
  for (const r of regions) {
    const p = pos.get(r.index)!
    cw = Math.max(cw, p.c + r.cw)
    ch = Math.max(ch, p.r + r.ch)
  }
  return { cw, ch, area: cw * ch }
}

const cases: Array<{
  name: string
  cols: number
  regions: Array<{ index: number; cw: number; ch: number }>
}> = [
  {
    name: 'current adversarial',
    cols: 16,
    regions: [
      { index: 0, cw: 8, ch: 2 },
      { index: 1, cw: 8, ch: 2 },
      { index: 2, cw: 8, ch: 2 },
      { index: 3, cw: 4, ch: 6 },
      { index: 4, cw: 4, ch: 6 },
      { index: 5, cw: 12, ch: 3 },
    ],
  },
  {
    name: 'wide then talls',
    cols: 10,
    regions: [
      { index: 0, cw: 10, ch: 2 },
      { index: 1, cw: 3, ch: 5 },
      { index: 2, cw: 3, ch: 5 },
      { index: 3, cw: 3, ch: 5 },
      { index: 4, cw: 7, ch: 2 },
    ],
  },
  {
    name: 'many small + one tall',
    cols: 12,
    regions: [
      { index: 0, cw: 4, ch: 2 },
      { index: 1, cw: 4, ch: 2 },
      { index: 2, cw: 4, ch: 2 },
      { index: 3, cw: 4, ch: 2 },
      { index: 4, cw: 4, ch: 2 },
      { index: 5, cw: 4, ch: 8 },
      { index: 6, cw: 8, ch: 3 },
    ],
  },
  {
    name: 'L shapes classic',
    cols: 8,
    regions: [
      { index: 0, cw: 5, ch: 2 },
      { index: 1, cw: 2, ch: 5 },
      { index: 2, cw: 3, ch: 3 },
      { index: 3, cw: 3, ch: 3 },
      { index: 4, cw: 6, ch: 2 },
    ],
  },
]

for (const c of cases) {
  const heightOnly = placeTopicRegionsDense(c.regions, c.cols, 0, {
    multiOrder: false,
    sortByHeight: true,
  })
  const inputOnly = placeTopicRegionsDense(c.regions, c.cols, 0, {
    multiOrder: false,
    sortByHeight: false,
  })
  const best = placeTopicRegionsDense(c.regions, c.cols, 0, {
    multiOrder: true,
  })
  const h = bbox(heightOnly, c.regions)
  const i = bbox(inputOnly, c.regions)
  const b = bbox(best, c.regions)
  console.log(c.name, {
    height: h,
    input: i,
    best: b,
    betterThanHeight: b.area < h.area || b.ch < h.ch,
    betterThanInput: b.area < i.area || b.ch < i.ch,
  })
}
