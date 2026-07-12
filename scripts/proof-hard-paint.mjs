/**
 * Proof: hard-paint path (v5 / current app) produces dark node bodies.
 * Playwright + host PNG pixel sampling. Writes proof report + screenshots.
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, readFileSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { execFileSync } from 'child_process'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'screenshots', 'theme-trials')
mkdirSync(outDir, { recursive: true })

const mermaidJs = readFileSync(
  join(dirname(require.resolve('mermaid/package.json')), 'dist', 'mermaid.min.js'),
  'utf8',
)
const mermaidVersion = require('mermaid/package.json').version

const C = {
  nodeFill: '#1f2020',
  nodeStroke: '#cccccc',
  nodeText: '#e0dfdf',
  edge: '#cccccc',
}

const SRC = `flowchart TD
    Start([Start]) --> Input[Collect input]
    Input --> Check{Valid?}
    Check -->|Yes| Process[Process data]
    Check -->|No| Input
    Process --> Done([Done])`

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
  const near1f2020 = nodeish.filter(
    (p) =>
      Math.abs(p.r - 31) <= 12 &&
      Math.abs(p.g - 32) <= 12 &&
      Math.abs(p.b - 32) <= 12,
  )
  return {
    nodeish: nodeish.length,
    pale: pale.length,
    dark: dark.length,
    white: white.length,
    near1f2020: near1f2020.length,
  }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })

// Page mirrors public/mermaid-test.html hard-paint logic
await page.setContent(
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { margin:0; background:#09090b; color:#e4e4e7; font:13px system-ui; padding:16px; }
  h1 { font-size:14px; margin:0 0 12px; }
  .row { display:flex; gap:16px; }
  .card { background:#12141a; border:1px solid #27272a; border-radius:8px; padding:16px; }
  h2 { font-size:11px; color:#71717a; margin:0 0 10px; text-transform:uppercase; letter-spacing:0.05em; }
</style>
</head>
<body>
  <h1>Proof hard paint (Playwright)</h1>
  <div class="row">
    <div class="card"><h2>1 raw default</h2><div id="def"></div></div>
    <div class="card"><h2>2 hard paint #1f2020</h2><div id="studio"></div></div>
  </div>
  <script>${mermaidJs.replace(/<\/script>/gi, '<\\/script>')}</script>
  <script>
    window.__DONE__=false; window.__META__=null; window.__ERR__=null;
    const C = ${JSON.stringify(C)};
    const src = ${JSON.stringify(SRC)};
    function force(el, fill, stroke) {
      if (fill !== undefined) { el.setAttribute('fill', fill); el.style.setProperty('fill', fill, 'important'); }
      if (stroke !== undefined) { el.setAttribute('stroke', stroke); el.style.setProperty('stroke', stroke, 'important'); }
    }
    function hardPaint(root) {
      root.querySelectorAll('g.node').forEach(g => {
        g.querySelectorAll('path,rect,polygon,circle,ellipse').forEach(el => {
          const fa = (el.getAttribute('fill')||'').toLowerCase();
          if (fa === 'none' || fa === 'transparent') { force(el, undefined, C.nodeStroke); return; }
          force(el, C.nodeFill, C.nodeStroke);
        });
        g.querySelectorAll('text,tspan').forEach(el => {
          force(el, C.nodeText, undefined);
          el.setAttribute('fill', C.nodeText);
          el.style.setProperty('fill', C.nodeText, 'important');
        });
      });
      root.querySelectorAll('.edgePath path,.flowchart-link').forEach(el => force(el, 'none', C.edge));
    }
    (async () => {
      try {
        mermaid.initialize({ startOnLoad:false, theme:'default', securityLevel:'loose',
          htmlLabels:false, flowchart:{ htmlLabels:false, useMaxWidth:false }});
        document.getElementById('def').innerHTML = (await mermaid.render('d1', src)).svg;

        mermaid.initialize({ startOnLoad:false, theme:'base', securityLevel:'loose',
          themeVariables:{ darkMode:true, background:'#12141a', primaryColor:C.nodeFill,
            primaryTextColor:C.nodeText, primaryBorderColor:C.nodeStroke, mainBkg:C.nodeFill,
            lineColor:C.edge, textColor:C.nodeText, nodeBorder:C.nodeStroke, nodeTextColor:C.nodeText },
          htmlLabels:false, flowchart:{ htmlLabels:false, useMaxWidth:false }});
        document.getElementById('studio').innerHTML = (await mermaid.render('d2', src)).svg;
        hardPaint(document.getElementById('studio'));

        const pick = (sel) => {
          const el = document.querySelector(sel + ' g.node path, ' + sel + ' g.node rect');
          if (!el) return null;
          return { fillAttr: el.getAttribute('fill'), style: el.getAttribute('style'),
            computed: getComputedStyle(el).fill };
        };
        window.__META__ = {
          def: pick('#def'),
          studio: pick('#studio'),
          mermaidVersion: ${JSON.stringify(mermaidVersion)},
        };
        window.__DONE__ = true;
      } catch (e) {
        window.__ERR__ = String(e && e.stack ? e.stack : e);
        window.__DONE__ = true;
      }
    })();
  </script>
</body>
</html>`,
  { waitUntil: 'domcontentloaded', timeout: 60000 },
)

await page.waitForFunction(() => window.__DONE__ === true, null, { timeout: 45000 })
const err = await page.evaluate(() => window.__ERR__)
const meta = await page.evaluate(() => window.__META__)

if (err) {
  console.error('RENDER ERROR', err)
  await page.screenshot({ path: join(outDir, 'proof-ERROR.png'), fullPage: true })
  process.exit(1)
}

const fullPath = join(outDir, 'proof-hard-paint-full.png')
const defHost = join(outDir, 'proof-hard-paint-default-host.png')
const studioHost = join(outDir, 'proof-hard-paint-studio-host.png')

await page.screenshot({ path: fullPath, fullPage: true })
await page.locator('#def').screenshot({ path: defHost })
await page.locator('#studio').screenshot({ path: studioHost })

const defScore = score(sampleGrid(defHost))
const studioScore = score(sampleGrid(studioHost))

// Strict: studio must have near-#1f2020 pixels, few white, dark dominates pale
const studioOk =
  studioScore.near1f2020 >= 3 &&
  studioScore.white === 0 &&
  studioScore.dark >= studioScore.pale &&
  meta?.studio?.fillAttr === '#1f2020'

const defOk =
  (defScore.pale >= 3 || defScore.white >= 2) &&
  meta?.def?.fillAttr &&
  /#ececff/i.test(meta.def.fillAttr)

const report = {
  generatedAt: new Date().toISOString(),
  mermaidVersion,
  method: 'Playwright + host PNG grid sample (System.Drawing)',
  criteria: {
    studioOk:
      'near1f2020>=3 AND white===0 AND dark>=pale AND fillAttr===#1f2020',
    defOk: 'pale/white present AND fillAttr #ECECFF',
  },
  meta,
  scores: { default: defScore, studio: studioScore },
  checks: { defOk, studioOk },
  screenshots: {
    full: 'screenshots/theme-trials/proof-hard-paint-full.png',
    defaultHost: 'screenshots/theme-trials/proof-hard-paint-default-host.png',
    studioHost: 'screenshots/theme-trials/proof-hard-paint-studio-host.png',
  },
  verdict: defOk && studioOk ? 'PROOF_OK' : 'PROOF_FAIL',
}

writeFileSync(join(outDir, 'proof-hard-paint-report.json'), JSON.stringify(report, null, 2))

const md = `# Proof: hard paint (this build)

Generated: **${report.generatedAt}**  
Mermaid: **${mermaidVersion}**  
Verdict: **${report.verdict}**

## Screenshots (Playwright)

| View | File |
|------|------|
| Full | ![full](proof-hard-paint-full.png) |
| Default (expect pale) | ![def](proof-hard-paint-default-host.png) |
| Hard paint #1f2020 (expect dark) | ![studio](proof-hard-paint-studio-host.png) |

## Pixel scores (host PNG grid)

| Chart | pale | dark | white | near#1f2020 |
|-------|------|------|-------|-------------|
| default | ${defScore.pale} | ${defScore.dark} | ${defScore.white} | ${defScore.near1f2020} |
| studio hard paint | ${studioScore.pale} | ${studioScore.dark} | ${studioScore.white} | ${studioScore.near1f2020} |

## DOM fills

\`\`\`json
${JSON.stringify(meta, null, 2)}
\`\`\`

## Checks

- default pale control: **${defOk ? 'OK' : 'FAIL'}**
- studio hard paint dark: **${studioOk ? 'OK' : 'FAIL'}**

## Criteria (no false alarm)

Studio only counts as OK if:
1. Host PNG has ≥3 samples near \`rgb(31,32,32)\` (#1f2020)
2. zero pure-white samples
3. dark count ≥ pale count
4. DOM \`fillAttr === '#1f2020'\`
`

writeFileSync(join(outDir, 'proof-hard-paint-RESULTS.md'), md)
copyFileSync(join(outDir, 'proof-hard-paint-RESULTS.md'), join(root, 'docs', 'proof-hard-paint-RESULTS.md'))
copyFileSync(join(outDir, 'proof-hard-paint-report.json'), join(root, 'docs', 'proof-hard-paint-report.json'))
// copy key images into docs for convenience
copyFileSync(studioHost, join(root, 'docs', 'proof-hard-paint-studio-host.png'))
copyFileSync(defHost, join(root, 'docs', 'proof-hard-paint-default-host.png'))
copyFileSync(fullPath, join(root, 'docs', 'proof-hard-paint-full.png'))

await browser.close()

console.log(JSON.stringify(report, null, 2))
console.log('\n=== PROOF ===', report.verdict)
console.log('Screenshots:')
console.log(' ', report.screenshots.full)
console.log(' ', report.screenshots.studioHost)
console.log(' ', report.screenshots.defaultHost)
process.exit(report.verdict === 'PROOF_OK' ? 0 : 1)
