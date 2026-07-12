/**
 * Mermaid theming trials — Playwright screenshots + PNG pixel sampling.
 * Record: screenshots/theme-trials/*.png + RESULTS.md + report.json
 */
import { chromium } from 'playwright'
import {
  writeFileSync,
  mkdirSync,
  readFileSync,
  copyFileSync,
  existsSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { execFileSync } from 'child_process'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'screenshots', 'theme-trials')
mkdirSync(outDir, { recursive: true })

const mermaidPkg = dirname(require.resolve('mermaid/package.json'))
const mermaidVersion = require('mermaid/package.json').version
const mermaidJsPath = join(mermaidPkg, 'dist', 'mermaid.min.js')
if (!existsSync(mermaidJsPath)) {
  console.error('missing', mermaidJsPath)
  process.exit(1)
}
const mermaidSource = readFileSync(mermaidJsPath, 'utf8')

const SRC = `flowchart TD
    Start([Start]) --> Input[Collect input]
    Input --> Check{Valid?}
    Check -->|Yes| Process[Process data]
    Check -->|No| Input
    Process --> Done([Done])`

const VARS = {
  darkMode: true,
  background: '#12141a',
  primaryColor: '#27272a',
  primaryTextColor: '#f4f4f5',
  primaryBorderColor: '#71717a',
  secondaryColor: '#3f3f46',
  secondaryTextColor: '#f4f4f5',
  tertiaryColor: '#18181b',
  tertiaryTextColor: '#f4f4f5',
  lineColor: '#a1a1aa',
  textColor: '#f4f4f5',
  mainBkg: '#27272a',
  nodeBorder: '#71717a',
  clusterBkg: '#18181b',
  clusterBorder: '#3f3f46',
  edgeLabelBackground: '#3f3f46',
  nodeTextColor: '#f4f4f5',
  classText: '#f4f4f5',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontSize: '14px',
}

const CLASSDEF = `    classDef default fill:#27272a,stroke:#71717a,color:#f4f4f5`

const FRONTMATTER = `---
config:
  theme: base
  themeVariables:
    darkMode: true
    background: "#12141a"
    primaryColor: "#27272a"
    primaryTextColor: "#f4f4f5"
    primaryBorderColor: "#71717a"
    mainBkg: "#27272a"
    lineColor: "#a1a1aa"
    nodeBorder: "#71717a"
    nodeTextColor: "#f4f4f5"
    textColor: "#f4f4f5"
    classText: "#f4f4f5"
    edgeLabelBackground: "#3f3f46"
---
`

function luma(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}
function isPale(r, g, b) {
  return luma(r, g, b) > 0.55
}
function isDarkNode(r, g, b) {
  const L = luma(r, g, b)
  return L < 0.4 && L > 0.02
}

/** Sample PNG via PowerShell System.Drawing (Windows). */
function samplePng(pngPath, points) {
  const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile('${pngPath.replace(/'/g, "''")}')
$pts = @(${points.map((p) => `@(${p.x},${p.y})`).join(',')})
$out = @()
foreach ($p in $pts) {
  $x = [Math]::Min($img.Width-1, [Math]::Max(0, $p[0]))
  $y = [Math]::Min($img.Height-1, [Math]::Max(0, $p[1]))
  $c = $img.GetPixel($x, $y)
  $out += [pscustomobject]@{x=$x;y=$y;r=$c.R;g=$c.G;b=$c.B}
}
$img.Dispose()
$out | ConvertTo-Json -Compress
`
  const raw = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-Command', ps],
    { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  ).trim()
  if (!raw) return []
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function sampleGrid(pngPath, cols = 5, rows = 8) {
  const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile('${pngPath.replace(/'/g, "''")}')
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
  const raw = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-Command', ps],
    { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  ).trim()
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : [parsed]
}

const TRIALS = [
  {
    id: '1-default-control',
    label: 'CONTROL: theme default (expect pale)',
    init: { theme: 'default' },
    source: SRC,
    expectPale: true,
  },
  {
    id: '2-builtin-dark',
    label: 'TRY1: theme dark only',
    init: { theme: 'dark' },
    source: SRC,
    expectPale: false,
  },
  {
    id: '3-base-variables',
    label: 'TRY2a: theme base + themeVariables',
    init: { theme: 'base', themeVariables: { ...VARS } },
    source: SRC,
    expectPale: false,
  },
  {
    id: '4-frontmatter',
    label: 'TRY2b: frontmatter base + themeVariables',
    init: { theme: 'default' },
    source: FRONTMATTER + SRC,
    expectPale: false,
  },
  {
    id: '5-classdef',
    label: 'TRY3: classDef default + base + vars',
    init: { theme: 'base', themeVariables: { ...VARS } },
    source: SRC + '\n' + CLASSDEF,
    expectPale: false,
  },
  {
    id: '6-frontmatter-classdef',
    label: 'TRY4: frontmatter + classDef',
    init: { theme: 'default' },
    source: FRONTMATTER + SRC + '\n' + CLASSDEF,
    expectPale: false,
  },
]

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 640, height: 720 } })
const results = []

for (const trial of TRIALS) {
  console.log(`\n>>> ${trial.id}`)
  const init = {
    startOnLoad: false,
    securityLevel: 'loose',
    flowchart: { htmlLabels: true, useMaxWidth: false },
    ...trial.init,
  }

  await page.setContent(
    `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { margin:0; background:#09090b; color:#e4e4e7; font:13px system-ui; padding:16px; }
  h1 { font-size:13px; color:#a1a1aa; margin:0 0 10px; font-weight:600; }
  #host {
    background:#12141a;
    display:inline-block;
    padding:24px 28px;
    border:1px solid #27272a;
    border-radius:8px;
  }
  #meta { margin-top:10px; font:11px ui-monospace,monospace; color:#71717a; white-space:pre-wrap; max-width:560px; }
</style>
</head>
<body>
  <h1 id="title"></h1>
  <div id="host"></div>
  <pre id="meta"></pre>
  <script>${mermaidSource.replace(/<\/script>/gi, '<\\/script>')}</script>
  <script>
    window.__DONE__ = false
    window.__ERR__ = null
    window.__META__ = null
    ;(async () => {
      try {
        document.getElementById('title').textContent = ${JSON.stringify(trial.label)}
        mermaid.initialize(${JSON.stringify(init)})
        const cfg = {
          theme: mermaid.mermaidAPI.getConfig().theme,
          mainBkg: mermaid.mermaidAPI.getConfig().themeVariables?.mainBkg,
          primaryColor: mermaid.mermaidAPI.getConfig().themeVariables?.primaryColor,
          darkMode: mermaid.mermaidAPI.getConfig().themeVariables?.darkMode,
        }
        const { svg } = await mermaid.render('c1', ${JSON.stringify(trial.source)})
        document.getElementById('host').innerHTML = svg
        const fills = [...document.querySelectorAll('#host g.node path, #host g.node rect')]
          .slice(0, 8)
          .map((el) => ({
            fill: el.getAttribute('fill'),
            computed: getComputedStyle(el).fill,
            tag: el.tagName,
            cls: el.getAttribute('class'),
          }))
        window.__META__ = { cfg, fills, mermaidVersion: ${JSON.stringify(mermaidVersion)} }
        document.getElementById('meta').textContent = JSON.stringify(window.__META__, null, 2)
        window.__DONE__ = true
      } catch (e) {
        window.__ERR__ = String(e && e.stack ? e.stack : e)
        document.getElementById('meta').textContent = window.__ERR__
        window.__DONE__ = true
      }
    })()
  </script>
</body>
</html>`,
    { waitUntil: 'domcontentloaded', timeout: 60000 },
  )

  await page.waitForFunction(() => window.__DONE__ === true, null, {
    timeout: 45000,
  })

  const err = await page.evaluate(() => window.__ERR__)
  const meta = await page.evaluate(() => window.__META__)

  const fullPath = join(outDir, `${trial.id}.png`)
  const hostPath = join(outDir, `${trial.id}-host.png`)
  await page.screenshot({ path: fullPath, fullPage: true })

  const host = page.locator('#host')
  await host.screenshot({ path: hostPath })

  if (err) {
    results.push({
      id: trial.id,
      label: trial.label,
      ok: false,
      error: err,
      screenshot: `screenshots/theme-trials/${trial.id}.png`,
      screenshotHost: `screenshots/theme-trials/${trial.id}-host.png`,
    })
    console.log('ERROR', trial.id, err.slice(0, 120))
    continue
  }

  // Sample host PNG on a grid — count pale vs dark (exclude near-black pane)
  const grid = sampleGrid(hostPath, 6, 10)
  // Filter out pure pane-like near-black (luma very low) AND keep mid-range
  const nodeish = grid.filter((p) => {
    const L = luma(p.r, p.g, p.b)
    // skip pure black / near pane
    if (L < 0.05) return false
    // skip very edge greys that are chrome borders occasionally
    return true
  })

  const pale = nodeish.filter((p) => isPale(p.r, p.g, p.b))
  // dark elevated nodes (zinc) — not pure black pane
  const dark = nodeish.filter((p) => isDarkNode(p.r, p.g, p.b))
  // white/near-white specifically
  const white = nodeish.filter(
    (p) => p.r > 230 && p.g > 230 && p.b > 230,
  )
  const lavender = nodeish.filter(
    (p) => p.r > 200 && p.b > 230 && p.g > 200 && p.b >= p.r,
  )

  // Also sample center band (where flowchart lives)
  const centerSamples = samplePng(hostPath, [
    { x: 80, y: 40 },
    { x: 100, y: 80 },
    { x: 100, y: 120 },
    { x: 100, y: 160 },
    { x: 100, y: 200 },
    { x: 100, y: 240 },
    { x: 100, y: 280 },
    { x: 100, y: 320 },
  ])

  const centerPale = centerSamples.filter((p) => isPale(p.r, p.g, p.b))
  const centerDark = centerSamples.filter((p) => isDarkNode(p.r, p.g, p.b))

  let ok
  if (trial.expectPale) {
    // control: must see pale or lavender in chart area
    ok = pale.length >= 3 || lavender.length >= 2 || centerPale.length >= 2
  } else {
    // success: dark node pixels present, white/lavender not dominant
    const paleDom =
      pale.length > dark.length || white.length >= 4 || lavender.length >= 3
    ok = dark.length >= 4 && !paleDom && centerDark.length >= 1
  }

  const avgOf = (arr) =>
    arr.length
      ? {
          r: Math.round(arr.reduce((a, p) => a + p.r, 0) / arr.length),
          g: Math.round(arr.reduce((a, p) => a + p.g, 0) / arr.length),
          b: Math.round(arr.reduce((a, p) => a + p.b, 0) / arr.length),
        }
      : null

  const row = {
    id: trial.id,
    label: trial.label,
    expectPale: trial.expectPale,
    ok,
    cfg: meta?.cfg,
    fillAttrs: meta?.fills?.slice(0, 6),
    grid: {
      total: grid.length,
      nodeish: nodeish.length,
      pale: pale.length,
      dark: dark.length,
      white: white.length,
      lavender: lavender.length,
    },
    center: {
      samples: centerSamples,
      pale: centerPale.length,
      dark: centerDark.length,
    },
    avgPale: avgOf(pale),
    avgDark: avgOf(dark),
    screenshot: `screenshots/theme-trials/${trial.id}.png`,
    screenshotHost: `screenshots/theme-trials/${trial.id}-host.png`,
  }
  results.push(row)

  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${trial.id} | pale=${pale.length} dark=${dark.length} white=${white.length} lav=${lavender.length} | cfg.theme=${meta?.cfg?.theme} mainBkg=${meta?.cfg?.mainBkg}`,
  )
  console.log(
    `     host=${row.screenshotHost} fills=${JSON.stringify(meta?.fills?.[0]?.fill)} computed=${meta?.fills?.[0]?.computed}`,
  )
}

await browser.close()

const winners = results.filter((r) => r.ok && !r.expectPale)
const control = results.find((r) => r.id === '1-default-control')

const report = {
  generatedAt: new Date().toISOString(),
  mermaidVersion,
  method:
    'Playwright render + #host PNG screenshot + System.Drawing grid sample (no canvas getImageData)',
  criteria: {
    pale: 'luma > 0.55',
    dark: '0.02 < luma < 0.4',
    successNonControl:
      'dark>=4 AND not (pale>dark OR white>=4 OR lavender>=3) AND centerDark>=1',
    successControl: 'pale>=3 OR lavender>=2 OR centerPale>=2',
  },
  results,
  winners: winners.map((w) => ({ id: w.id, label: w.label })),
  recommendation:
    winners.length > 0
      ? `Apply first winner in app: ${winners[0].id} — ${winners[0].label}`
      : 'No trial met dark node-body criteria from host screenshots. Inspect PNGs in screenshots/theme-trials/.',
}

writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))

const md = `# Mermaid theme trials — screenshot record

Generated: **${report.generatedAt}**  
Mermaid: **${mermaidVersion}**  
Method: Playwright render → screenshot \`#host\` → sample PNG pixels (grid + center column).  
**No post-render paint.**

## Criteria

| Term | Definition |
|------|------------|
| Pale | luma &gt; 0.55 (white / lavender) |
| Dark | 0.02 &lt; luma &lt; 0.4 (elevated dark zinc range) |
| Control OK | sees pale/lavender in chart |
| Trial OK | enough dark body pixels, white/lavender not dominant |

## Results table

| ID | Label | Result | pale | dark | white | lav | cfg theme / mainBkg | Screenshots |
|----|-------|--------|------|------|-------|-----|---------------------|-------------|
${results
  .map((r) => {
    const res = r.error ? 'ERROR' : r.ok ? '**OK**' : '**FAIL**'
    const g = r.grid || {}
    return `| \`${r.id}\` | ${r.label} | ${res} | ${g.pale ?? '—'} | ${g.dark ?? '—'} | ${g.white ?? '—'} | ${g.lavender ?? '—'} | \`${r.cfg?.theme ?? '?'}\` / \`${r.cfg?.mainBkg ?? '—'}\` | [full](${r.id}.png) · [host](${r.id}-host.png) |`
  })
  .join('\n')}

## Winners

${
  winners.length
    ? winners.map((w) => `1. **\`${w.id}\`** — ${w.label}`).join('\n')
    : '_None._'
}

## Recommendation

${report.recommendation}

## Control

${
  control
    ? `\`${control.id}\`: **${control.ok ? 'OK (pale as expected)' : 'FAIL'}** pale=${control.grid?.pale} white=${control.grid?.white}`
    : 'missing'
}

## Per-trial notes

${results
  .map((r) => {
    return `### ${r.id}

- **Label:** ${r.label}
- **Result:** ${r.ok ? 'OK' : 'FAIL'}${r.error ? ` — ${r.error.slice(0, 200)}` : ''}
- **Config:** \`${JSON.stringify(r.cfg)}\`
- **First fill attr / computed:** \`${JSON.stringify(r.fillAttrs?.[0])}\`
- **Grid:** pale=${r.grid?.pale} dark=${r.grid?.dark} white=${r.grid?.white} lavender=${r.grid?.lavender}
- **Center column:** pale=${r.center?.pale} dark=${r.center?.dark}
- **Screenshots:** ![host](${r.id}-host.png)
`
  })
  .join('\n')}
`

writeFileSync(join(outDir, 'RESULTS.md'), md)
// also copy into docs for permanent record
mkdirSync(join(root, 'docs'), { recursive: true })
writeFileSync(join(root, 'docs', 'mermaid-theme-trials-RESULTS.md'), md)
copyFileSync(join(outDir, 'report.json'), join(root, 'docs', 'mermaid-theme-trials-report.json'))

console.log('\n========== SUMMARY ==========')
console.log(JSON.stringify(report.winners, null, 2))
console.log(report.recommendation)
console.log('Record:', join(outDir, 'RESULTS.md'))
console.log('Docs copy:', join(root, 'docs', 'mermaid-theme-trials-RESULTS.md'))
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id}`)
}
