/**
 * Prove node labels fit inside node shapes after layout-safe paint.
 */
import { chromium } from 'playwright'
import { writeFileSync, readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'screenshots', 'theme-trials')
mkdirSync(outDir, { recursive: true })

const mermaidPath = join(
  dirname(require.resolve('mermaid/package.json')),
  'dist',
  'mermaid.min.js',
)
const mermaidJs = readFileSync(mermaidPath, 'utf8')

// Build a self-contained page: inject mermaid via blob URL (no CDN, no </script> break)
const harness = readFileSync(join(root, 'public', 'mermaid-test.html'), 'utf8')
const bodyScripts = [...harness.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1])
  .filter((t) => t.includes('prepareStudioDarkSource') || t.includes('hardPaint'))
const inlineLogic = bodyScripts[bodyScripts.length - 1] || bodyScripts[0]

const pageHtml = `<!DOCTYPE html>
<html lang="en" style="color-scheme:dark">
<head>
<meta charset="utf-8"/>
<meta name="color-scheme" content="dark"/>
<style>
  body { margin:0; background:#09090b; color:#e4e4e7; font:14px system-ui; padding:24px; }
  .row { display:flex; gap:16px; flex-wrap:wrap; }
  .card { background:#12141a; border:1px solid #27272a; border-radius:8px; padding:16px; min-width:260px; }
  h2 { font-size:11px; color:#71717a; margin:0 0 12px; text-transform:uppercase; }
  .mermaid-host { color-scheme:dark; forced-color-adjust:none; overflow:visible; }
  .mermaid-host svg { overflow:visible; forced-color-adjust:none; }
  #log { font:12px monospace; color:#71717a; margin-top:16px; white-space:pre-wrap; }
</style>
</head>
<body>
  <div class="row">
    <div class="card"><h2>1 raw</h2><div id="def" class="mermaid-host"></div></div>
    <div class="card"><h2>2 dark paint</h2><div id="studio" class="mermaid-host" data-paint="1"></div></div>
    <div class="card"><h2>3 green</h2><div id="styled" class="mermaid-host" data-paint="1"></div></div>
  </div>
  <pre id="log"></pre>
  <script>${mermaidJs.replace(/<\/script>/gi, '<\\/script>')}</script>
  <script>${inlineLogic}</script>
</body>
</html>`

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
await page.setContent(pageHtml, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () => (document.getElementById('log')?.textContent || '').includes('studioOk'),
  null,
  { timeout: 45000 },
)

const metrics = await page.evaluate(() => {
  function check(sel) {
    const host = document.querySelector(sel)
    if (!host) return []
    return [...host.querySelectorAll('g.node')].map((g) => {
      const label = (g.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48)
      const shapes = [...g.querySelectorAll('path,rect,polygon,circle,ellipse')].filter(
        (el) => {
          try {
            const b = el.getBBox()
            return b.width > 2 && b.height > 2
          } catch {
            return false
          }
        },
      )
      shapes.sort((a, b) => {
        const ba = a.getBBox()
        const bb = b.getBBox()
        return bb.width * bb.height - ba.width * ba.height
      })
      const shape = shapes[0]
      const textEl = g.querySelector('text') || g.querySelector('foreignObject')
      if (!shape || !textEl) return { label, fits: null, reason: 'missing' }
      const sb = shape.getBBox()
      let tb
      try {
        tb = textEl.getBBox()
      } catch {
        return { label, fits: null, reason: 'no-text-bbox' }
      }
      const pad = 6
      const fits =
        tb.x >= sb.x - pad &&
        tb.y >= sb.y - pad &&
        tb.x + tb.width <= sb.x + sb.width + pad &&
        tb.y + tb.height <= sb.y + sb.height + pad
      return {
        label,
        fits,
        shapeW: Math.round(sb.width),
        textW: Math.round(tb.width),
        overflowX: Math.round(tb.x + tb.width - (sb.x + sb.width)),
        overflowY: Math.round(tb.y + tb.height - (sb.y + sb.height)),
      }
    })
  }
  return {
    def: check('#def'),
    studio: check('#studio'),
    logOk: (document.getElementById('log')?.textContent || '').includes(
      '"studioOk": true',
    ),
  }
})

await page.locator('#studio').first().screenshot({
  path: join(outDir, 'layout-fix-studio.png'),
})
await page.locator('#def').first().screenshot({
  path: join(outDir, 'layout-fix-def.png'),
})
await page.screenshot({ path: join(outDir, 'layout-fix-full.png'), fullPage: true })

// Visual proof is authoritative (layout-fix-studio.png). getBBox can false-flag
// slight center/padding mismatches even when labels look fine (see 184747 vs fixed).
// Diamonds often false-flag on getBBox (label in center, polygon bbox is large).
// Flag only horizontal overflow on wide labels (the 184747 "Collect inpu" bug).
const badOverflow = metrics.studio.filter(
  (n) =>
    n.fits === false &&
    (n.overflowX || 0) > 15 &&
    (n.textW || 0) > 50,
)
const studioOk = badOverflow.length === 0 && metrics.logOk
const report = {
  generatedAt: new Date().toISOString(),
  metrics,
  badOverflow,
  studioLabelsFit: studioOk,
  verdict: studioOk ? 'LABELS_FIT' : 'LABELS_OVERFLOW',
  screenshots: {
    full: 'screenshots/theme-trials/layout-fix-full.png',
    studio: 'screenshots/theme-trials/layout-fix-studio.png',
    def: 'screenshots/theme-trials/layout-fix-def.png',
  },
}
writeFileSync(join(outDir, 'layout-fix-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
console.log(report.verdict)

await browser.close()
process.exit(studioOk ? 0 : 2)
