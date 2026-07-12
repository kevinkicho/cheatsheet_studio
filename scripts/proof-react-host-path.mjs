/**
 * Prove the React-like path: mermaid render → paint → host with data-mermaid-dark
 * + the same host CSS rules as src/index.css.
 * This is what MermaidView mounts in the app.
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

const SRC = `flowchart TD
    Start([Start]) --> Input[Collect input]
    Input --> Check{Valid?}
    Check -->|Yes| Process[Process data]
    Check -->|No| Input
    Process --> Done([Done])`

function prepare(source) {
  return `---
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
---
${source.trim()}
    classDef default fill:${STUDIO.nodeFill},stroke:${STUDIO.nodeStroke},color:${STUDIO.nodeText}`
}

function dense(png) {
  const e = png.replace(/'/g, "''")
  const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile('${e}')
$w=0;$near=0;$pale=0;$total=0
for ($y=0; $y -lt $img.Height; $y+=2) {
  for ($x=0; $x -lt $img.Width; $x+=2) {
    $c = $img.GetPixel($x,$y)
    $L = (0.2126*$c.R + 0.7152*$c.G + 0.0722*$c.B)/255.0
    if ($L -lt 0.08) { continue }
    $total++
    if ($c.R -gt 230 -and $c.G -gt 230 -and $c.B -gt 230) { $w++ }
    if ([Math]::Abs($c.R-39) -le 14 -and [Math]::Abs($c.G-39) -le 14 -and [Math]::Abs($c.B-42) -le 14) { $near++ }
    if ($L -gt 0.55) { $pale++ }
  }
}
$img.Dispose()
@{total=$total;white=$w;pale=$pale;near27272a=$near} | ConvertTo-Json -Compress
`
  return JSON.parse(
    execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], {
      encoding: 'utf8',
    }).trim(),
  )
}

// Host CSS copied from src/index.css studio-dark block
const HOST_CSS = `
.mermaid-host svg { background: transparent; display: block; }
.mermaid-host[data-mermaid-dark='true'] g.node path,
.mermaid-host[data-mermaid-dark='true'] g.node rect,
.mermaid-host[data-mermaid-dark='true'] g.node polygon,
.mermaid-host[data-mermaid-dark='true'] g.node circle,
.mermaid-host[data-mermaid-dark='true'] g.node ellipse {
  fill: #27272a !important;
  stroke: #71717a !important;
}
.mermaid-host[data-mermaid-dark='true'] g.node path[fill='none'],
.mermaid-host[data-mermaid-dark='true'] g.node path[fill='transparent'] {
  fill: none !important;
}
.mermaid-host[data-mermaid-dark='true'] g.node text,
.mermaid-host[data-mermaid-dark='true'] g.node tspan {
  fill: #f4f4f5 !important;
}
.mermaid-host[data-mermaid-dark='true'] .edgePath path,
.mermaid-host[data-mermaid-dark='true'] .flowchart-link {
  fill: none !important;
  stroke: #a1a1aa !important;
}
`

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 500, height: 700 } })

await page.setContent(
  `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  body { margin:0; background:#09090b; padding:16px; }
  .preview { background:#12141a; border:1px solid #27272a; border-radius:8px; padding:12px; }
  ${HOST_CSS}
</style>
</head>
<body>
  <div class="preview">
    <div class="mermaid-host" data-mermaid-dark="true" id="host"></div>
  </div>
  <script>${mermaidJs.replace(/<\/script>/gi, '<\\/script>')}</script>
  <script>
  window.__DONE__=false; window.__META__=null; window.__ERR__=null;
  const STUDIO = ${JSON.stringify(STUDIO)};
  const prepared = ${JSON.stringify(prepare(SRC))};
  function force(el, fill, stroke) {
    if (fill !== undefined) { el.setAttribute('fill', fill); el.style.setProperty('fill', fill, 'important'); }
    if (stroke !== undefined) { el.setAttribute('stroke', stroke); el.style.setProperty('stroke', stroke, 'important'); }
  }
  function paint(root) {
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
        },
        htmlLabels:false, flowchart:{ htmlLabels:false, useMaxWidth:false }
      });
      // Offscreen measure box (MermaidView path)
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden';
      const { svg } = await mermaid.render('react-probe', prepared);
      box.innerHTML = svg;
      document.body.appendChild(box);
      const svgEl = box.querySelector('svg');
      paint(svgEl);
      const markup = svgEl.outerHTML;
      box.remove();
      // React-like mount
      const host = document.getElementById('host');
      host.innerHTML = markup;
      paint(host); // useLayoutEffect re-paint
      const el = host.querySelector('g.node path, g.node rect');
      window.__META__ = {
        fillAttr: el?.getAttribute('fill'),
        computed: el ? getComputedStyle(el).fill : null,
        dataDark: host.getAttribute('data-mermaid-dark'),
      };
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

const hostPath = join(outDir, 'proof-react-host-path.png')
await page.locator('#host').screenshot({ path: hostPath })
const score = dense(hostPath)

const ok =
  score.near27272a >= 400 &&
  score.pale < score.total * 0.15 &&
  score.white < score.total * 0.1 &&
  /27272a|39,\s*39,\s*42/i.test((meta?.fillAttr || '') + (meta?.computed || ''))

const report = {
  generatedAt: new Date().toISOString(),
  method: 'React MermaidView path + host CSS (index.css studio-dark)',
  meta,
  score,
  ok,
  verdict: ok ? 'PROOF_OK' : 'PROOF_FAIL',
  screenshot: 'screenshots/theme-trials/proof-react-host-path.png',
  reference: 'screenshots/theme-trials/verify-app-stack-studio-host.png',
}

writeFileSync(join(outDir, 'proof-react-host-path-report.json'), JSON.stringify(report, null, 2))
copyFileSync(hostPath, join(root, 'docs', 'proof-react-host-path.png'))
copyFileSync(
  join(outDir, 'proof-react-host-path-report.json'),
  join(root, 'docs', 'proof-react-host-path-report.json'),
)

await browser.close()
console.log(JSON.stringify(report, null, 2))
console.log(ok ? '=== PROOF_OK ===' : '=== PROOF_FAIL ===')
process.exit(ok ? 0 : 1)
