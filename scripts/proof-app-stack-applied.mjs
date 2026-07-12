/**
 * Prove the applied app stack (frontmatter+classDef+hard paint) matches
 * verify-app-stack-studio-host look: dark nodes, white≈0.
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

// Mirror src/lib/mermaidTheme.ts after this change
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

const BASE = `flowchart TD
    Start([Start]) --> Input[Collect input]
    Input --> Check{Valid?}
    Check -->|Yes| Process[Process data]
    Check -->|No| Input
    Process --> Done([Done])`

function prepare(source) {
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
  return (
    fm +
    source.trim() +
    `\n    classDef default fill:${STUDIO.nodeFill},stroke:${STUDIO.nodeStroke},color:${STUDIO.nodeText}`
  )
}

function dense(png) {
  const e = png.replace(/'/g, "''")
  const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile('${e}')
$w=0;$n1=0;$pale=0;$total=0
for ($y=0; $y -lt $img.Height; $y+=2) {
  for ($x=0; $x -lt $img.Width; $x+=2) {
    $c = $img.GetPixel($x,$y)
    $L = (0.2126*$c.R + 0.7152*$c.G + 0.0722*$c.B)/255.0
    if ($L -lt 0.08) { continue }
    $total++
    if ($c.R -gt 230 -and $c.G -gt 230 -and $c.B -gt 230) { $w++ }
    if ([Math]::Abs($c.R-39) -le 12 -and [Math]::Abs($c.G-39) -le 12 -and [Math]::Abs($c.B-42) -le 12) { $n1++ }
    if ($L -gt 0.55) { $pale++ }
  }
}
$img.Dispose()
@{total=$total;white=$w;pale=$pale;near27272a=$n1} | ConvertTo-Json -Compress
`
  return JSON.parse(
    execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], {
      encoding: 'utf8',
    }).trim(),
  )
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })

await page.setContent(
  `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
body{margin:0;background:#09090b;color:#e4e4e7;font:13px system-ui;padding:16px}
.card{background:#12141a;border:1px solid #27272a;border-radius:8px;padding:16px;display:inline-block}
</style></head>
<body>
<div class="card"><div id="studio"></div></div>
<script>${mermaidJs.replace(/<\/script>/gi, '<\\/script>')}</script>
<script>
window.__DONE__=false; window.__META__=null; window.__ERR__=null;
const STUDIO = ${JSON.stringify(STUDIO)};
const prepared = ${JSON.stringify(prepare(BASE))};
function force(el, fill, stroke) {
  if (fill !== undefined) { el.setAttribute('fill', fill); el.style.setProperty('fill', fill, 'important'); }
  if (stroke !== undefined) { el.setAttribute('stroke', stroke); el.style.setProperty('stroke', stroke, 'important'); }
}
function paint(root) {
  const svg = root.querySelector('svg');
  if (svg) {
    const st = document.createElement('style');
    st.setAttribute('data-studio-paint','1');
    st.textContent = 'g.node path,g.node rect,g.node polygon,g.node circle,g.node ellipse{fill:'+STUDIO.nodeFill+' !important;stroke:'+STUDIO.nodeStroke+' !important;}g.node path[fill="none"]{fill:none !important;}g.node text,g.node tspan{fill:'+STUDIO.nodeText+' !important;}.edgePath path,.flowchart-link{fill:none !important;stroke:'+STUDIO.edge+' !important;}';
    svg.insertBefore(st, svg.firstChild);
  }
  root.querySelectorAll('g.node').forEach(g => {
    g.querySelectorAll('path,rect,polygon,circle,ellipse').forEach(el => {
      const fa = (el.getAttribute('fill')||'').toLowerCase();
      if (fa === 'none' || fa === 'transparent') { force(el, undefined, STUDIO.nodeStroke); return; }
      force(el, STUDIO.nodeFill, STUDIO.nodeStroke);
    });
    g.querySelectorAll('text,tspan').forEach(el => {
      force(el, STUDIO.nodeText, undefined);
      el.setAttribute('fill', STUDIO.nodeText);
    });
  });
}
(async () => {
  try {
    mermaid.initialize({
      startOnLoad:false, theme:'base', securityLevel:'loose',
      themeVariables: {
        darkMode:true, background:STUDIO.bg, primaryColor:STUDIO.nodeFill,
        primaryTextColor:STUDIO.nodeText, primaryBorderColor:STUDIO.nodeStroke,
        mainBkg:STUDIO.nodeFill, lineColor:STUDIO.edge, textColor:STUDIO.nodeText,
        nodeBorder:STUDIO.nodeStroke, nodeTextColor:STUDIO.nodeText,
      },
      htmlLabels:false, flowchart:{ htmlLabels:false, useMaxWidth:false }
    });
    const host = document.getElementById('studio');
    host.innerHTML = (await mermaid.render('d2', prepared)).svg;
    paint(host);
    const el = host.querySelector('g.node path, g.node rect');
    window.__META__ = el ? { fillAttr: el.getAttribute('fill'), computed: getComputedStyle(el).fill } : null;
    window.__DONE__ = true;
  } catch (e) {
    window.__ERR__ = String(e && e.stack ? e.stack : e);
    window.__DONE__ = true;
  }
})();
</script>
</body></html>`,
  { waitUntil: 'domcontentloaded', timeout: 60000 },
)

await page.waitForFunction(() => window.__DONE__ === true, null, { timeout: 45000 })
const err = await page.evaluate(() => window.__ERR__)
const meta = await page.evaluate(() => window.__META__)
if (err) {
  console.error(err)
  process.exit(1)
}

const hostPath = join(outDir, 'proof-app-stack-applied-studio-host.png')
const fullPath = join(outDir, 'proof-app-stack-applied-full.png')
await page.locator('#studio').screenshot({ path: hostPath })
await page.screenshot({ path: fullPath, fullPage: true })

const score = dense(hostPath)
// Match verify-app-stack criteria: dark dominates, few pale; light text may
// register as near-white (#f4f4f5) so allow a small white budget.
const ok =
  score.near27272a >= 500 &&
  score.pale < score.total * 0.15 &&
  score.white < score.total * 0.08 &&
  /27272a|39,\s*39,\s*42/i.test((meta?.fillAttr || '') + (meta?.computed || ''))

const report = {
  generatedAt: new Date().toISOString(),
  method: 'app-stack (frontmatter+classDef) + hard paint — same as mermaidTheme.ts',
  meta,
  score,
  ok,
  verdict: ok ? 'PROOF_OK' : 'PROOF_FAIL',
  screenshots: {
    host: 'screenshots/theme-trials/proof-app-stack-applied-studio-host.png',
    full: 'screenshots/theme-trials/proof-app-stack-applied-full.png',
    reference: 'screenshots/theme-trials/verify-app-stack-studio-host.png',
  },
}

writeFileSync(join(outDir, 'proof-app-stack-applied-report.json'), JSON.stringify(report, null, 2))
copyFileSync(hostPath, join(root, 'docs', 'proof-app-stack-applied-studio-host.png'))
copyFileSync(
  join(outDir, 'proof-app-stack-applied-report.json'),
  join(root, 'docs', 'proof-app-stack-applied-report.json'),
)

await browser.close()
console.log(JSON.stringify(report, null, 2))
console.log(ok ? '=== PROOF_OK ===' : '=== PROOF_FAIL ===')
process.exit(ok ? 0 : 1)
