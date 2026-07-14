import fs from 'fs'
import path from 'path'

const file = process.argv[2]
if (!file) {
  console.error('usage: node analyze-export-svg.mjs <svg>')
  process.exit(1)
}
const s = fs.readFileSync(file, 'utf8')
console.log('file', path.basename(file), 'bytes', s.length)
const vb = s.match(/viewBox="([^"]+)"/)
console.log('viewBox', vb?.[1])
const imgs = [...s.matchAll(/<image\b[^>]*(?:\/>|>)/g)]
console.log('image count', imgs.length)
let i = 0
for (const m of imgs) {
  const t = m[0]
  const attr = (n) => (t.match(new RegExp(`${n}="([^"]*)"`)) || [])[1]
  const href = attr('href') || attr('xlink:href') || ''
  const b64 = href.includes('base64,') ? href.split('base64,')[1] : ''
  console.log(`img[${i}]`, {
    x: attr('x'),
    y: attr('y'),
    w: attr('width'),
    h: attr('height'),
    dataLen: b64.length,
    mime: (href.match(/^data:([^;]+)/) || [])[1],
  })
  i++
}

// Look for process/card structure
const groups = (s.match(/<g\b/g) || []).length
const texts = [...s.matchAll(/>([^<]{4,100})</g)]
  .map((m) => m[1].replace(/\s+/g, ' ').trim())
  .filter((t) => t && !t.startsWith('data:') && !/^[\d.\s-]+$/.test(t))
console.log('groups', groups)
console.log('sample texts', texts.slice(0, 50))

// Detect clipped / tiny regions by looking at transform + size patterns
const foreign = (s.match(/foreignObject/g) || []).length
console.log('foreignObject', foreign)
console.log('clipPath defs', (s.match(/clipPath/g) || []).length)

// Card-like rounded rects with size
const rects = [...s.matchAll(/<rect\b[^>]*>/g)].map((m) => {
  const t = m[0]
  const a = (n) => Number((t.match(new RegExp(`${n}="([^"]*)"`)) || [])[1] || NaN)
  return { w: a('width'), h: a('height'), x: a('x'), y: a('y'), rx: a('rx') }
})
const big = rects.filter((r) => r.w > 80 && r.h > 40).sort((a, b) => b.w * b.h - a.w * a.h)
console.log('big rects (top 20 by area):')
for (const r of big.slice(0, 20)) {
  console.log(' ', r)
}

// Extract PNGs for visual inspection
const outDir = process.argv[3]
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  let n = 0
  for (const m of imgs) {
    const t = m[0]
    const href = (t.match(/(?:href|xlink:href)="([^"]*)"/) || [])[1] || ''
    if (!href.startsWith('data:image')) continue
    const [meta, b64] = href.split(',')
    const ext = meta.includes('png') ? 'png' : meta.includes('jpeg') ? 'jpg' : 'bin'
    const buf = Buffer.from(b64, 'base64')
    const fp = path.join(outDir, `embed-${n}.${ext}`)
    fs.writeFileSync(fp, buf)
    console.log('wrote', fp, buf.length)
    n++
  }
}
