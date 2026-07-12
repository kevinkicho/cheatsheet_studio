/**
 * Playwright proof of live /mermaid-test.html (firebase serve :5000).
 * Host PNG grid + DOM fillAttr. Writes record under screenshots/theme-trials + docs.
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'screenshots', 'theme-trials')
mkdirSync(outDir, { recursive: true })

const BASE = process.env.PROOF_BASE || 'http://localhost:5002'

function luma(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function sampleGrid(pngPath, cols = 6, rows = 10) {
  const escaped = pngPath.replace(/'/g, "''")
  const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile('${escaped}')
$w=$img.Width; $h=$img.Height
$out=@()
for ($row=1; $row -le ${rows}; $row++) {
  for ($col=1; $col -le ${cols}; $col++) {
    $x = [int](($col - 0.5) * $w / ${cols})
    $y = [int](($row - 0.5) * $h / ${rows})
    $c = $img.GetPixel([Math]::Min($w-1,$x), [Math]::Min($h-1,$y))
    $out += [pscustomobject]@{x=$x;y=$y;r=$c.R;g=$c.G;b=$c.B}
  }
}
$img.Dispose()
$out | ConvertTo-Json -Compress
`
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], {
    encoding: 'utf8',
  }).trim()
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function score(grid) {
  const nodeish = grid.filter((p) => luma(p.r, p.g, p.b) > 0.05)
  const pale = nodeish.filter((p) => luma(p.r, p.g, p.b) > 0.55)
  const dark = nodeish.filter((p) => {
    const L = luma(p.r, p.g, p.b)
    return L > 0.02 && L < 0.4
  })
  const white = nodeish.filter((p) => p.r > 230 && p.g > 230 && p.b > 230)
  // #27272a (app-stack) or #1f2020 (v5)
  const nearDark = nodeish.filter(
    (p) =>
      (Math.abs(p.r - 39) <= 14 &&
        Math.abs(p.g - 39) <= 14 &&
        Math.abs(p.b - 42) <= 14) ||
      (Math.abs(p.r - 31) <= 12 &&
        Math.abs(p.g - 32) <= 12 &&
        Math.abs(p.b - 32) <= 12),
  )
  return {
    nodeish: nodeish.length,
    pale: pale.length,
    dark: dark.length,
    white: white.length,
    near1f2020: nearDark.length,
    nearDark: nearDark.length,
  }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })

const url = `${BASE}/mermaid-test.html?t=${Date.now()}`
console.log('GOTO', url)
const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
console.log('status', resp?.status())

await page.waitForFunction(
  () => {
    const log = document.getElementById('log')?.textContent || ''
    return log.includes('"v"') || log.includes('Error') || log.includes('stack')
  },
  null,
  { timeout: 45000 },
)

const logText = await page.locator('#log').innerText()
let meta = null
try {
  meta = JSON.parse(logText)
} catch {
  meta = { parseError: true, logText }
}

const fullPath = join(outDir, 'proof-mermaid-test-live-full.png')
const defHost = join(outDir, 'proof-mermaid-test-live-def-host.png')
const studioHost = join(outDir, 'proof-mermaid-test-live-studio-host.png')
const styledHost = join(outDir, 'proof-mermaid-test-live-styled-host.png')

await page.screenshot({ path: fullPath, fullPage: true })
await page.locator('#def').screenshot({ path: defHost })
await page.locator('#studio').screenshot({ path: studioHost })
await page.locator('#styled').screenshot({ path: styledHost })

const defScore = score(sampleGrid(defHost))
const studioScore = score(sampleGrid(studioHost))
const styledScore = score(sampleGrid(styledHost))

const studioOk =
  studioScore.nearDark >= 3 &&
  studioScore.dark >= studioScore.pale &&
  studioScore.white < studioScore.nodeish * 0.15 &&
  /27272a|1f2020|39,\s*39,\s*42|31,\s*32,\s*32/i.test(
    (meta?.studio?.fillAttr || '') + (meta?.studio?.computed || ''),
  )

const defOk =
  (defScore.pale >= 3 || defScore.white >= 2) &&
  meta?.def?.fillAttr &&
  /#ececff/i.test(meta.def.fillAttr)

const report = {
  generatedAt: new Date().toISOString(),
  url,
  httpStatus: resp?.status() ?? null,
  pageTitle: await page.title(),
  meta,
  scores: { default: defScore, studio: studioScore, styled: styledScore },
  checks: { defOk, studioOk },
  screenshots: {
    full: 'screenshots/theme-trials/proof-mermaid-test-live-full.png',
    defHost: 'screenshots/theme-trials/proof-mermaid-test-live-def-host.png',
    studioHost: 'screenshots/theme-trials/proof-mermaid-test-live-studio-host.png',
    styledHost: 'screenshots/theme-trials/proof-mermaid-test-live-styled-host.png',
  },
  verdict: defOk && studioOk ? 'PROOF_OK' : 'PROOF_FAIL',
}

writeFileSync(
  join(outDir, 'proof-mermaid-test-live-report.json'),
  JSON.stringify(report, null, 2),
)

const md = `# Proof: live mermaid-test.html

Generated: **${report.generatedAt}**  
URL: \`${url}\`  
HTTP: **${report.httpStatus}**  
Title: **${report.pageTitle}**  
Verdict: **${report.verdict}**

## Screenshots (Playwright)

| View | File |
|------|------|
| Full | ![full](proof-mermaid-test-live-full.png) |
| Card 1 raw default | ![def](proof-mermaid-test-live-def-host.png) |
| Card 2 hard paint #1f2020 | ![studio](proof-mermaid-test-live-studio-host.png) |
| Card 3 Start green | ![styled](proof-mermaid-test-live-styled-host.png) |

## Pixel scores

| Chart | pale | dark | white | near#1f2020 |
|-------|------|------|-------|-------------|
| default | ${defScore.pale} | ${defScore.dark} | ${defScore.white} | ${defScore.near1f2020} |
| studio hard paint | ${studioScore.pale} | ${studioScore.dark} | ${studioScore.white} | ${studioScore.near1f2020} |
| styled | ${styledScore.pale} | ${styledScore.dark} | ${styledScore.white} | ${styledScore.near1f2020} |

## DOM log

\`\`\`json
${JSON.stringify(meta, null, 2)}
\`\`\`

## Checks

- default pale control: **${defOk ? 'OK' : 'FAIL'}**
- studio hard paint dark: **${studioOk ? 'OK' : 'FAIL'}**
`

writeFileSync(join(outDir, 'proof-mermaid-test-live-RESULTS.md'), md)
copyFileSync(join(outDir, 'proof-mermaid-test-live-RESULTS.md'), join(root, 'docs', 'proof-mermaid-test-live-RESULTS.md'))
copyFileSync(join(outDir, 'proof-mermaid-test-live-report.json'), join(root, 'docs', 'proof-mermaid-test-live-report.json'))
for (const f of [
  'proof-mermaid-test-live-full.png',
  'proof-mermaid-test-live-def-host.png',
  'proof-mermaid-test-live-studio-host.png',
  'proof-mermaid-test-live-styled-host.png',
]) {
  copyFileSync(join(outDir, f), join(root, 'docs', f))
}

await browser.close()
console.log(JSON.stringify(report, null, 2))
console.log('\n=== PROOF LIVE mermaid-test ===', report.verdict)
process.exit(report.verdict === 'PROOF_OK' ? 0 : 1)
