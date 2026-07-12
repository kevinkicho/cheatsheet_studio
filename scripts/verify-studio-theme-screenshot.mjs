/**
 * Verify current app theming stack (base + themeVariables + frontmatter + classDef)
 * with Playwright screenshots + PNG pixel sampling.
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { execFileSync } from 'child_process'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'screenshots', 'theme-trials')
mkdirSync(outDir, { recursive: true })

const mermaidJsPath = join(
  dirname(require.resolve('mermaid/package.json')),
  'dist',
  'mermaid.min.js',
)
const mermaidSource = readFileSync(mermaidJsPath, 'utf8')
const mermaidVersion = require('mermaid/package.json').version

// Mirror src/lib/mermaidTheme.ts STUDIO_DARK + prepareStudioDarkSource
const STUDIO = {
  nodeFill: '#27272a',
  nodeStroke: '#71717a',
  nodeText: '#f4f4f5',
  edge: '#a1a1aa',
  edgeLabelBg: '#3f3f46',
  clusterFill: '#18181b',
  clusterStroke: '#3f3f46',
  bg: '#12141a',
}

const VARS = {
  darkMode: true,
  background: STUDIO.bg,
  primaryColor: STUDIO.nodeFill,
  primaryTextColor: STUDIO.nodeText,
  primaryBorderColor: STUDIO.nodeStroke,
  secondaryColor: STUDIO.edgeLabelBg,
  secondaryTextColor: STUDIO.nodeText,
  tertiaryColor: STUDIO.clusterFill,
  tertiaryTextColor: STUDIO.nodeText,
  lineColor: STUDIO.edge,
  textColor: STUDIO.nodeText,
  mainBkg: STUDIO.nodeFill,
  nodeBorder: STUDIO.nodeStroke,
  clusterBkg: STUDIO.clusterFill,
  clusterBorder: STUDIO.clusterStroke,
  edgeLabelBackground: STUDIO.edgeLabelBg,
  nodeTextColor: STUDIO.nodeText,
  classText: STUDIO.nodeText,
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontSize: '14px',
}

const BASE_SRC = `flowchart TD
    Start([Start]) --> Input[Collect input]
    Input --> Check{Valid?}
    Check -->|Yes| Process[Process data]
    Check -->|No| Input
    Process --> Done([Done])`

function prepareStudioDarkSource(source) {
  let text = source.trim()
  const fm = `---
config:
  theme: base
  themeVariables:
    darkMode: true
    background: "${STUDIO.bg}"
    primaryColor: "${STUDIO.nodeFill}"
    primaryTextColor: "${STUDIO.nodeText}"
    primaryBorderColor: "${STUDIO.nodeStroke}"
    mainBkg: "${STUDIO.nodeFill}"
    lineColor: "${STUDIO.edge}"
    nodeBorder: "${STUDIO.nodeStroke}"
    nodeTextColor: "${STUDIO.nodeText}"
    textColor: "${STUDIO.nodeText}"
    classText: "${STUDIO.nodeText}"
    edgeLabelBackground: "${STUDIO.edgeLabelBg}"
    clusterBkg: "${STUDIO.clusterFill}"
    clusterBorder: "${STUDIO.clusterStroke}"
---
`
  text = fm + text
  text += `\n    classDef default fill:${STUDIO.nodeFill},stroke:${STUDIO.nodeStroke},color:${STUDIO.nodeText}`
  return text
}

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

const prepared = prepareStudioDarkSource(BASE_SRC)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 700, height: 780 } })

// Side-by-side: default vs app stack
await page.setContent(
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { margin:0; background:#09090b; color:#e4e4e7; font:13px system-ui; padding:20px; }
  h1 { font-size:15px; margin:0 0 6px; }
  p { color:#a1a1aa; font-size:12px; margin:0 0 16px; }
  .row { display:flex; gap:20px; flex-wrap:wrap; }
  .card {
    background:#12141a; border:1px solid #27272a; border-radius:8px;
    padding:16px 20px; min-width:200px;
  }
  .card h2 { font-size:11px; text-transform:uppercase; letter-spacing:0.06em;
    color:#71717a; margin:0 0 12px; }
  #meta { margin-top:16px; font:11px ui-monospace,monospace; color:#71717a;
    white-space:pre-wrap; max-width:640px; }
  .badge { display:inline-block; padding:4px 10px; border-radius:4px; font-weight:700; margin-top:12px; }
  .ok { background:#14532d; color:#86efac; }
  .bad { background:#7f1d1d; color:#fca5a5; }
</style>
</head>
<body>
  <h1>Verify: app theming stack (official API)</h1>
  <p>Left = default · Right = initialize base+vars + frontmatter + classDef + htmlLabels:false</p>
  <div class="row">
    <div class="card"><h2>1 · default</h2><div id="def"></div></div>
    <div class="card"><h2>2 · studio (app path)</h2><div id="studio"></div></div>
  </div>
  <div id="badge"></div>
  <pre id="meta"></pre>
  <script>${mermaidSource.replace(/<\/script>/gi, '<\\/script>')}</script>
  <script>
    window.__DONE__ = false
    window.__DATA__ = null
    ;(async () => {
      try {
        const baseSrc = ${JSON.stringify(BASE_SRC)}
        const prepared = ${JSON.stringify(prepared)}
        const vars = ${JSON.stringify(VARS)}

        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          flowchart: { htmlLabels: false, useMaxWidth: false },
        })
        document.getElementById('def').innerHTML = (await mermaid.render('d1', baseSrc)).svg

        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          themeVariables: vars,
          htmlLabels: false,
          flowchart: { htmlLabels: false, useMaxWidth: false },
        })
        document.getElementById('studio').innerHTML = (await mermaid.render('d2', prepared)).svg

        const pick = (sel) => {
          const el = document.querySelector(sel + ' g.node path, ' + sel + ' g.node rect')
          if (!el) return null
          return {
            fillAttr: el.getAttribute('fill'),
            computed: getComputedStyle(el).fill,
          }
        }
        window.__DATA__ = {
          def: pick('#def'),
          studio: pick('#studio'),
          cfg: {
            theme: mermaid.mermaidAPI.getConfig().theme,
            mainBkg: mermaid.mermaidAPI.getConfig().themeVariables?.mainBkg,
            primaryColor: mermaid.mermaidAPI.getConfig().themeVariables?.primaryColor,
          },
          mermaidVersion: ${JSON.stringify(mermaidVersion)},
        }
        document.getElementById('meta').textContent = JSON.stringify(window.__DATA__, null, 2)
      } catch (e) {
        document.getElementById('meta').textContent = String(e && e.stack ? e.stack : e)
        window.__DATA__ = { error: String(e) }
      }
      window.__DONE__ = true
    })()
  </script>
</body>
</html>`,
  { waitUntil: 'domcontentloaded', timeout: 60000 },
)

await page.waitForFunction(() => window.__DONE__ === true, null, {
  timeout: 45000,
})

const data = await page.evaluate(() => window.__DATA__)

const fullPath = join(outDir, 'verify-app-stack.png')
const studioHost = join(outDir, 'verify-app-stack-studio-host.png')
const defHost = join(outDir, 'verify-app-stack-default-host.png')

await page.screenshot({ path: fullPath, fullPage: true })
await page.locator('#studio').screenshot({ path: studioHost })
await page.locator('#def').screenshot({ path: defHost })

const studioGrid = sampleGrid(studioHost)
const defGrid = sampleGrid(defHost)

const score = (grid) => {
  const nodeish = grid.filter((p) => luma(p.r, p.g, p.b) > 0.05)
  const pale = nodeish.filter((p) => luma(p.r, p.g, p.b) > 0.55)
  const dark = nodeish.filter((p) => {
    const L = luma(p.r, p.g, p.b)
    return L > 0.02 && L < 0.4
  })
  const white = nodeish.filter((p) => p.r > 230 && p.g > 230 && p.b > 230)
  return {
    pale: pale.length,
    dark: dark.length,
    white: white.length,
    nodeish: nodeish.length,
  }
}

const studioScore = score(studioGrid)
const defScore = score(defGrid)

// Studio OK: dark fills dominate, not white
const studioOk =
  studioScore.dark >= 4 &&
  studioScore.white < 4 &&
  studioScore.pale <= studioScore.dark &&
  data?.studio?.fillAttr &&
  !/#ececff/i.test(data.studio.fillAttr) &&
  !/^#fff/i.test(data.studio.fillAttr || '')

const defOk = defScore.pale >= 2 || defScore.white >= 2

const report = {
  generatedAt: new Date().toISOString(),
  mermaidVersion,
  stack:
    'initialize(base+themeVariables) + frontmatter + classDef default + htmlLabels:false',
  data,
  scores: { default: defScore, studio: studioScore },
  checks: {
    defaultLooksPale: defOk,
    studioLooksDark: studioOk,
  },
  screenshots: {
    full: 'screenshots/theme-trials/verify-app-stack.png',
    studioHost: 'screenshots/theme-trials/verify-app-stack-studio-host.png',
    defaultHost: 'screenshots/theme-trials/verify-app-stack-default-host.png',
  },
  verdict: studioOk && defOk ? 'STUDIO_DARK_OK' : 'STUDIO_DARK_FAIL',
}

// Badge on page for the full screenshot
await page.evaluate((v) => {
  const el = document.getElementById('badge')
  if (!el) return
  el.className = 'badge ' + (v === 'STUDIO_DARK_OK' ? 'ok' : 'bad')
  el.textContent =
    v === 'STUDIO_DARK_OK'
      ? 'STUDIO DARK OK — node bodies dark by screenshot pixels'
      : 'STUDIO DARK FAIL — see scores in meta'
}, report.verdict)

// Re-screenshot full with badge
await page.screenshot({ path: fullPath, fullPage: true })

writeFileSync(join(outDir, 'verify-app-stack-report.json'), JSON.stringify(report, null, 2))

const md = `# Verify app theming stack

Generated: ${report.generatedAt}  
Mermaid: ${mermaidVersion}  
Stack: \`${report.stack}\`

## Screenshots

| View | File |
|------|------|
| Full (default vs studio) | ![full](verify-app-stack.png) |
| Studio host only | ![studio](verify-app-stack-studio-host.png) |
| Default host only | ![default](verify-app-stack-default-host.png) |

## Pixel scores (from host PNGs)

| Chart | pale | dark | white | nodeish |
|-------|------|------|-------|---------|
| default | ${defScore.pale} | ${defScore.dark} | ${defScore.white} | ${defScore.nodeish} |
| studio | ${studioScore.pale} | ${studioScore.dark} | ${studioScore.white} | ${studioScore.nodeish} |

## Fill attrs

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

## Verdict

**${report.verdict}**

- defaultLooksPale: ${defOk}
- studioLooksDark: ${studioOk}
`

writeFileSync(join(outDir, 'verify-app-stack-RESULTS.md'), md)
writeFileSync(join(root, 'docs', 'verify-app-stack-RESULTS.md'), md)

await browser.close()

console.log(JSON.stringify(report, null, 2))
console.log('\nScreenshots:')
console.log(' ', report.screenshots.full)
console.log(' ', report.screenshots.studioHost)
console.log(' ', report.screenshots.defaultHost)
console.log('Verdict:', report.verdict)
process.exit(studioOk ? 0 : 1)
