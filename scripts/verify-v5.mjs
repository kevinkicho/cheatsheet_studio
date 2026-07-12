import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })

await page.goto('http://127.0.0.1:5000/mermaid-test.html?v=5&t=' + Date.now(), {
  waitUntil: 'networkidle',
  timeout: 30000,
})
await page.waitForFunction(
  () => /studioOk|PASS|FAIL/.test(document.body.innerText),
  null,
  { timeout: 20000 },
)

const log = await page.locator('#log').textContent()
const body = await page.locator('body').innerText()
await page.screenshot({
  path: join(root, 'screenshots/verify-v5.png'),
  fullPage: true,
})

// Sample pixels from studio card
const studioBox = await page.locator('#studio').boundingBox()
const styledBox = await page.locator('#styled').boundingBox()

async function sampleCard(box, name) {
  if (!box) return null
  const shot = await page.screenshot({
    clip: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: Math.min(box.height, 280),
    },
  })
  // decode png via playwright - just report fill attrs from DOM
  return name
}

const fills = await page.evaluate(() => {
  const grab = (sel) => {
    const nodes = [...document.querySelectorAll(sel + ' g.node')]
    return nodes.slice(0, 2).map((g) => {
      const p = g.querySelector('path, rect')
      return {
        id: g.id,
        fillAttr: p?.getAttribute('fill'),
        styleFill: p?.style?.fill,
        computed: p ? getComputedStyle(p).fill : null,
      }
    })
  }
  return {
    def: grab('#def'),
    studio: grab('#studio'),
    styled: grab('#styled'),
  }
})

// Pixel sample via canvas draw of SVG is hard; use getImageData from screenshot
const { createRequire } = await import('module')
// Use pure page.evaluate with svg to canvas if possible
const pixels = await page.evaluate(async () => {
  function sampleHost(hostSel) {
    const host = document.querySelector(hostSel)
    const svg = host?.querySelector('svg')
    if (!svg) return null
    const xml = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.width || 200
        c.height = img.height || 300
        const ctx = c.getContext('2d')
        ctx.fillStyle = '#18181b'
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.drawImage(img, 0, 0)
        // sample center-ish of first node area
        const pts = [
          [c.width / 2, 30],
          [c.width / 2, 80],
          [c.width / 2, 140],
        ].map(([x, y]) => {
          const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
          return { x, y, r: d[0], g: d[1], b: d[2] }
        })
        URL.revokeObjectURL(url)
        resolve({ w: c.width, h: c.height, pts })
      }
      img.onerror = () => resolve({ error: 'img fail' })
      img.src = url
    })
  }
  return {
    studio: await sampleHost('#studio'),
    styled: await sampleHost('#styled'),
    def: await sampleHost('#def'),
  }
})

writeFileSync(
  join(root, 'screenshots/verify-v5-report.json'),
  JSON.stringify({ log, fills, pixels, bodySnippet: body.slice(0, 500) }, null, 2),
)

console.log('LOG', log)
console.log('FILLS', JSON.stringify(fills, null, 2))
console.log('PIXELS', JSON.stringify(pixels, null, 2))
console.log('PASS_LINES', body.split('\n').filter((l) => /PASS|FAIL/.test(l)))

const report = JSON.parse(log)
if (!report.studioOk || !report.greenOk) {
  console.error('VERIFY FAILED', report)
  process.exit(1)
}
console.log('VERIFY OK')
await browser.close()
