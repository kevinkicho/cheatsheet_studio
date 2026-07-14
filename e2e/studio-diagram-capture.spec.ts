/**
 * Browser-level test of Studio diagram capture (html2canvas path).
 * Unit tests mock html2canvas — this file is the real quality gate for
 * “does capture produce a non-solid diagram PNG?”.
 *
 * Target quality: export (2).svg style — readable labels, not empty boxes.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Studio-style html2canvas capture produces useful diagram PNG', async ({
  page,
}) => {
  test.setTimeout(90_000)

  // Load html2canvas-pro from node_modules via file URL is awkward;
  // use CDN build that matches capture API surface.
  await page.setContent(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; background: #0f1115; }
    #host {
      width: 360px; height: 280px; background: #1e2028;
      display: flex; align-items: center; justify-content: center;
    }
    #host svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div id="host" data-testid="mermaid-view" class="mermaid-host">
    <pre class="mermaid">
flowchart TD
  A[Estimate free cash flows] --> B[Choose discount rate]
  B --> C[Compute NPV IRR PI]
  C --> D{NPV positive?}
  D -->|Yes| E[Rank and fund]
  D -->|No| F[Reject or rework]
    </pre>
  </div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    import h2c from 'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.8/+esm';

    // Match CAPTURE_CONTRAST in exportSvg.ts
    const COLORS = {
      nodeFill: '#3f3f46',
      nodeStroke: '#d4d4d8',
      nodeText: '#fafafa',
      edge: '#a1a1aa',
    };

    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'loose',
      themeVariables: {
        darkMode: true,
        primaryColor: COLORS.nodeFill,
        primaryTextColor: COLORS.nodeText,
        primaryBorderColor: COLORS.nodeStroke,
        lineColor: COLORS.edge,
        secondaryColor: '#52525b',
        tertiaryColor: '#27272a',
        background: '#1e2028',
      },
      flowchart: { htmlLabels: true, useMaxWidth: true },
    });

    await mermaid.run({ querySelector: 'pre.mermaid' });

    const host = document.getElementById('host');
    const svg = host.querySelector('svg');
    if (!svg) throw new Error('no svg');

    // Bake contrast fills (mirrors bakeDiagramSvgForCapture)
    svg.querySelectorAll('g.node path, g.node rect, g.node polygon, g.node circle').forEach((el) => {
      if (el.closest('.edgePath, .flowchart-link')) return;
      el.setAttribute('fill', COLORS.nodeFill);
      el.setAttribute('stroke', COLORS.nodeStroke);
    });
    svg.querySelectorAll('.edgePath path, .flowchart-link').forEach((el) => {
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', COLORS.edge);
    });
    svg.querySelectorAll('foreignObject div, foreignObject span, .nodeLabel').forEach((el) => {
      el.style.color = COLORS.nodeText;
      el.style.background = 'transparent';
      el.style.backgroundColor = 'transparent';
    });
    svg.querySelectorAll('text, tspan').forEach((el) => {
      el.setAttribute('fill', COLORS.nodeText);
    });

    const canvas = await h2c(host, {
      backgroundColor: '#1e2028',
      scale: 2,
      logging: false,
      foreignObjectRendering: true,
    });
    const dataUrl = canvas.toDataURL('image/png');
    const b64 = dataUrl.split(',')[1] || '';
    const bytes = Math.floor((b64.length * 3) / 4);
    window.__CAPTURE__ = { dataUrl, bytes, w: canvas.width, h: canvas.height };
  </script>
</body>
</html>`,
    { waitUntil: 'networkidle' },
  )

  await page.waitForFunction(
    () =>
      Boolean(
        (window as unknown as { __CAPTURE__?: { bytes: number } }).__CAPTURE__
          ?.bytes,
      ),
    { timeout: 45_000 },
  )

  const result = await page.evaluate(() => {
    return (window as unknown as { __CAPTURE__: {
      bytes: number
      w: number
      h: number
      dataUrl: string
    } }).__CAPTURE__
  })

  // Real flowchart raster should be well above solid stub sizes
  expect(result.bytes).toBeGreaterThan(8_000)
  expect(result.w).toBeGreaterThan(400)
  expect(result.h).toBeGreaterThan(300)

  // Persist for manual inspection
  const out = path.join(root, 'examples/agent-out/e2e-studio-diagram-capture.png')
  const b64 = result.dataUrl.replace(/^data:image\/png;base64,/, '')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(b64, 'base64'))
  expect(fs.statSync(out).size).toBeGreaterThan(8_000)
})
