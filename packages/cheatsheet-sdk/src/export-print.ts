/**
 * Headless print export: HTML / SVG / PDF / PNG / JPG.
 *
 * Vector-scalable (zoom forever, sharp type/diagrams):
 *   - HTML  — KaTeX + Mermaid SVG in the browser
 *   - SVG   — foreignObject wrap of the rendered sheet (vector layout)
 *   - PDF   — Playwright print (fonts/paths; not a bitmap)
 *
 * Raster only (pixels, will pixelate when scaled):
 *   - PNG / JPG — screenshots for quick share; use --scale 2|3 for more pixels
 *
 * Default layout is **canvas** (absolute x/y) for dense cheatsheet mosaics.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { CanvasItem, SheetDocument } from './types'
import { LETTER_PX } from './defaults'

export type ExportHtmlOptions = {
  dark?: boolean
  footer?: boolean
  rich?: boolean
  /**
   * canvas — absolute positions (cheatsheet mosaic). Default.
   * stack — legacy vertical list (ignores x/y).
   */
  layout?: 'canvas' | 'stack'
  /** Page background size; default letter or content bounds for canvas. */
  pageWidth?: number
  pageHeight?: number
  /**
   * Raster scale for PNG/JPG (Playwright deviceScaleFactor).
   * 1 ≈ 96 DPI (~900×1100 letter) — soft on retina / print.
   * 2 ≈ 192 DPI (default) — sharp screen + light print.
   * 3 ≈ 288 DPI — high-res print / zoom.
   */
  scale?: 1 | 2 | 3
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function mdTableToHtml(md: string): string {
  const lines = md
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
  const rows = lines.filter((l) => !/^\|?[\s-:|]+$/.test(l))
  if (rows.length === 0) return `<pre>${escapeHtml(md)}</pre>`
  const parse = (line: string) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())
  let html = '<table>'
  rows.forEach((line, i) => {
    const cells = parse(line)
    const tag = i === 0 ? 'th' : 'td'
    html +=
      '<tr>' +
      cells.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join('') +
      '</tr>'
  })
  html += '</table>'
  return html
}

function itemBodyHtml(it: CanvasItem, rich: boolean): string {
  if (it.latex) {
    if (rich) {
      return `<div class="latex" data-latex="${escapeHtml(it.latex)}"></div>`
    }
    return `<div class="latex"><code>${escapeHtml(it.latex)}</code></div>`
  }
  if (it.tableMarkdown) {
    return mdTableToHtml(it.tableMarkdown)
  }
  if (it.mermaidSource) {
    return `<pre class="mermaid">${escapeHtml(it.mermaidSource)}</pre>`
  }
  if (it.imageUrl) {
    const src = escapeHtml(it.imageUrl)
    return `<img src="${src}" alt="${escapeHtml(it.title ?? 'figure')}" class="fig" />`
  }
  return '<p class="empty">—</p>'
}

function contentBounds(items: CanvasItem[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = 0
  let maxY = 0
  for (const it of items) {
    if (it.hidden) continue
    minX = Math.min(minX, it.x)
    minY = Math.min(minY, it.y)
    maxX = Math.max(maxX, it.x + it.width)
    maxY = Math.max(maxY, it.y + it.height)
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: LETTER_PX.width, maxY: LETTER_PX.height }
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Build a standalone HTML print document from a SheetDocument.
 */
export function sheetToPrintHtml(
  sheet: SheetDocument,
  opts: ExportHtmlOptions = {},
): string {
  const dark = opts.dark !== false
  const footer = opts.footer !== false
  const rich = opts.rich !== false
  const layout = opts.layout ?? 'canvas'
  const bg = dark ? '#0f1115' : '#faf9f6'
  const fg = dark ? '#e8eaed' : '#1a1a1a'
  const card = dark ? 'rgba(28,30,36,0.98)' : 'rgba(255,255,255,0.92)'
  const border = dark ? 'rgba(99,102,241,0.4)' : 'rgba(0,0,0,0.12)'
  const muted = dark ? '#9ca3af' : '#555'
  const mermaidTheme = dark ? 'dark' : 'neutral'

  const sorted = [...sheet.items]
    .filter((i) => !i.hidden)
    .sort((a, b) => a.zIndex - b.zIndex)

  const nEq = sorted.filter((i) => i.latex).length
  const nTable = sorted.filter((i) => i.tableMarkdown).length
  const nProc = sorted.filter((i) => i.mermaidSource).length
  const nFig = sorted.filter((i) => i.imageUrl).length

  const bounds = contentBounds(sorted)
  const pageW =
    opts.pageWidth ??
    (layout === 'canvas'
      ? Math.max(LETTER_PX.width, Math.ceil(bounds.maxX + 24))
      : LETTER_PX.width)
  const pageH =
    opts.pageHeight ??
    (layout === 'canvas'
      ? Math.max(LETTER_PX.height, Math.ceil(bounds.maxY + 24))
      : LETTER_PX.height)

  let cards: string
  if (layout === 'stack') {
    cards = sorted
      .map((it) => {
        const showTitle = it.showTitle !== false && Boolean(it.title)
        const title = showTitle
          ? `<div class="card-title">${escapeHtml(it.title!)}</div>`
          : ''
        return `<article class="card stack" data-type="${escapeHtml(it.type)}">
  ${title}
  <div class="card-body">${itemBodyHtml(it, rich)}</div>
</article>`
      })
      .join('\n')
  } else {
    cards = sorted
      .map((it) => {
        const fs = it.style?.fontSize ?? 11
        const tfs = it.style?.titleFontSize ?? 8
        // Section banners use latex body only (showTitle false) — avoid duplicate label
        const showTitle = it.showTitle !== false && Boolean(it.title)
        const title = showTitle
          ? `<div class="card-title" style="font-size:${tfs}px">${escapeHtml(it.title!)}</div>`
          : ''
        const isProc =
          it.type === 'process-chart' || Boolean(it.mermaidSource)
        return `<article class="card abs" data-type="${escapeHtml(it.type)}"${isProc ? ' data-process="1"' : ''}${!showTitle ? ' data-banner="1"' : ''}
  style="left:${Math.round(it.x)}px;top:${Math.round(it.y)}px;width:${Math.round(it.width)}px;height:${Math.round(it.height)}px;font-size:${fs}px">
  ${title}
  <div class="card-body">${itemBodyHtml(it, rich)}</div>
</article>`
      })
      .join('\n')
  }

  const richHead = rich
    ? `
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css" crossorigin="anonymous" />
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js" crossorigin="anonymous"></script>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: false,
      theme: '${dark ? 'base' : mermaidTheme}',
      securityLevel: 'loose',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      // Studio-like dark nodes (avoid default pale/white chips)
      themeVariables: ${
        dark
          ? JSON.stringify({
              darkMode: true,
              background: '#12141a',
              primaryColor: '#27272a',
              primaryTextColor: '#f4f4f5',
              primaryBorderColor: '#71717a',
              secondaryColor: '#3f3f46',
              secondaryTextColor: '#f4f4f5',
              tertiaryColor: '#18181b',
              lineColor: '#a1a1aa',
              textColor: '#f4f4f5',
              mainBkg: '#27272a',
              nodeBorder: '#71717a',
              clusterBkg: '#18181b',
              clusterBorder: '#3f3f46',
              titleColor: '#f4f4f5',
              edgeLabelBackground: '#3f3f46',
              nodeTextColor: '#f4f4f5',
            })
          : '{}'
      },
      flowchart: { nodeSpacing: 18, rankSpacing: 22, padding: 6, useMaxWidth: true, htmlLabels: true },
      mindmap: { useMaxWidth: true, padding: 6 },
    });
    // Explicit run is more reliable than startOnLoad in Playwright/file://
    try {
      await mermaid.run({ querySelector: 'pre.mermaid' });
    } catch (e) {
      console.warn('mermaid.run partial failure', e);
    }
    window.__mermaidReady = true;
  </script>
  <script>
    function renderKatex() {
      if (typeof katex === 'undefined') return;
      document.querySelectorAll('.latex[data-latex]').forEach(function (el) {
        var src = el.getAttribute('data-latex') || '';
        try {
          katex.render(src, el, { throwOnError: false, displayMode: true });
        } catch (e) {
          el.textContent = src;
        }
      });
    }
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(renderKatex, 40);
      setTimeout(renderKatex, 350);
    });
  </script>`
    : ''

  const boardClass = layout === 'canvas' ? 'board canvas' : 'board stack'
  const boardInner =
    layout === 'canvas'
      ? `<div class="surface" style="width:${pageW}px;height:${pageH}px">${cards}</div>`
      : `<div class="stack-flow">
    <h1>${escapeHtml(sheet.title)}</h1>
    <div class="meta">${sorted.length} cards · ${nEq} eq · ${nTable} table · ${nProc} process · ${nFig} figure</div>
    ${cards}
  </div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(sheet.title)}</title>
  <style>
    @page { size: letter portrait; margin: 0.35in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: ${dark ? '#09090b' : '#e8e4dc'};
      color: ${fg};
      font-size: 11px;
      line-height: 1.25;
    }
    .board.canvas {
      display: flex;
      justify-content: center;
      /* No outer padding — hi-DPI screenshots crop .surface cleanly */
      padding: 0;
      margin: 0;
    }
    .surface {
      position: relative;
      background: ${bg};
      box-shadow: none;
      overflow: hidden;
      /* Hint browsers to rasterize sharply */
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }
    .surface::before {
      content: ${JSON.stringify(sheet.title)};
      position: absolute;
      left: 10px;
      top: 6px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: ${muted};
      opacity: 0.85;
      z-index: 0;
      pointer-events: none;
      max-width: 90%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card.abs {
      position: absolute;
      z-index: 1;
      background: ${card};
      border: 1px solid ${border};
      border-radius: 4px;
      padding: 3px 5px 4px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    /* Content may be scale()-fitted so formulas/diagrams stay fully visible */
    .card.abs .card-body {
      transform-origin: center center;
    }
    .card.stack {
      background: ${card};
      border: 1px solid ${border};
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 8px;
    }
    .card[data-type="process-chart"] {
      border-color: ${dark ? 'rgba(129,140,248,0.5)' : 'rgba(79,70,229,0.35)'};
    }
    .card[data-type="figure"] {
      border-color: ${dark ? 'rgba(52,211,153,0.4)' : 'rgba(16,185,129,0.35)'};
    }
    .card-title {
      font-size: 7px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: ${muted};
      margin-bottom: 2px;
      font-weight: 650;
      line-height: 1.15;
      flex-shrink: 0;
    }
    .card-body {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .latex { font-size: 1em; overflow: hidden; max-width: 100%; }
    .latex .katex { font-size: 1em !important; }
    .latex code {
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 0.9em;
      white-space: pre-wrap;
      word-break: break-word;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 0.85em;
    }
    th, td {
      border: 1px solid ${border};
      padding: 1px 3px;
      text-align: left;
    }
    th { color: ${muted}; font-weight: 600; }
    pre.mermaid {
      margin: 0;
      font-size: 9px;
      white-space: pre-wrap;
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      overflow: hidden;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    pre.mermaid svg {
      max-width: 100% !important;
      max-height: 100% !important;
      width: 100% !important;
      height: auto !important;
      display: block;
    }
    img.mermaid-raster {
      display: block;
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: 0 auto;
    }
    .card.abs[data-process="1"] .card-body {
      align-items: center;
      justify-content: center;
      padding: 2px 0;
    }
    /* Section dividers: full-width band, latex label only (no card title) */
    .card.abs[data-banner="1"] {
      background: ${dark ? 'rgba(49,46,129,0.45)' : 'rgba(99,102,241,0.12)'};
      border-color: ${dark ? 'rgba(129,140,248,0.65)' : 'rgba(99,102,241,0.4)'};
      border-left-width: 3px;
      padding: 2px 8px;
      min-height: 18px;
    }
    .card.abs[data-banner="1"] .card-body {
      justify-content: flex-start;
      align-items: center;
    }
    .card.abs[data-banner="1"] .latex .katex {
      font-size: 0.95em !important;
      font-weight: 700;
    }
    img.fig {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }
    .stack-flow {
      max-width: ${LETTER_PX.width}px;
      margin: 0 auto;
      padding: 20px;
      background: ${bg};
    }
    .stack-flow h1 { font-size: 1.1rem; margin: 0 0 0.4rem; }
    .meta { color: ${muted}; font-size: 10px; margin-bottom: 0.8rem; }
    footer.sheet-foot {
      margin-top: 8px;
      text-align: center;
      font-size: 8px;
      color: ${muted};
    }
    @media print {
      body { background: ${bg}; }
      .board.canvas { padding: 0; }
      .surface { box-shadow: none; }
    }
  </style>
  ${richHead}
</head>
<body>
  <div class="${boardClass}">
    ${boardInner}
  </div>
  ${
    footer
      ? `<footer class="sheet-foot">${escapeHtml(sheet.title)} · ${sorted.length} blocks · agent canvas export</footer>`
      : ''
  }
</body>
</html>
`
}

export function writeSheetHtml(
  sheet: SheetDocument,
  outPath: string,
  opts?: ExportHtmlOptions,
): string {
  const html = sheetToPrintHtml(sheet, opts)
  mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
  writeFileSync(outPath, html, 'utf8')
  return path.resolve(outPath)
}

export type ExportPdfResult = {
  pdfPath: string
  htmlPath?: string
  engine: 'playwright' | 'html-only'
}

export type ExportImageResult = {
  imagePath: string
  htmlPath?: string
  format: 'png' | 'jpeg'
  engine: 'playwright'
}

export type ExportSvgResult = {
  svgPath: string
  htmlPath?: string
  width: number
  height: number
  engine: 'playwright'
}

function pathToFileUrl(p: string): string {
  const resolved = path.resolve(p)
  if (process.platform === 'win32') {
    return 'file:///' + resolved.replace(/\\/g, '/')
  }
  return 'file://' + resolved
}

type PlaywrightPage = {
  screenshot: (o: Record<string, unknown>) => Promise<Buffer>
  pdf: (o: Record<string, unknown>) => Promise<Buffer>
  goto: (url: string, o?: Record<string, unknown>) => Promise<unknown>
  waitForTimeout: (ms: number) => Promise<void>
  setViewportSize: (s: { width: number; height: number }) => Promise<void>
  evaluate: (fn: (...args: never[]) => unknown, arg?: unknown) => Promise<unknown>
  locator: (sel: string) => {
    screenshot: (o: Record<string, unknown>) => Promise<Buffer>
    count: () => Promise<number>
    first: () => {
      screenshot: (o: Record<string, unknown>) => Promise<Buffer>
      count: () => Promise<number>
    }
  }
}

/**
 * Force studio-dark fills on Mermaid SVGs (CDN default is pale/white nodes).
 * Also used so Playwright screenshots match Studio chrome.
 */
async function paintMermaidDark(page: PlaywrightPage): Promise<void> {
  await page.evaluate(() => {
    const nodeFill = '#27272a'
    const nodeStroke = '#71717a'
    const nodeText = '#f4f4f5'
    const edge = '#a1a1aa'
    const edgeLabelBg = '#3f3f46'
    document
      .querySelectorAll('pre.mermaid svg, .mermaid svg')
      .forEach((svg) => {
        const root = svg as SVGSVGElement
        root.style.background = 'transparent'
        root
          .querySelectorAll(
            'g.node path, g.node rect, g.node polygon, g.node circle, g.node ellipse, .mindmap-node path, .mindmap-node rect, section.mindmap-node',
          )
          .forEach((el) => {
            if (el.closest('.edgePath, .flowchart-link, marker')) return
            const f = (el.getAttribute('fill') || '').toLowerCase()
            if (
              !f ||
              f === 'none' ||
              f === '#fff' ||
              f === '#ffffff' ||
              f === 'white' ||
              f === '#ececff' ||
              f === '#eaeaea' ||
              f === '#f4f4f4' ||
              f === '#f9f9f9' ||
              /^#f{3,8}$/i.test(f)
            ) {
              el.setAttribute('fill', nodeFill)
              ;(el as SVGElement).style.fill = nodeFill
            }
            const st = (el.getAttribute('stroke') || '').toLowerCase()
            if (!st || st === '#000' || st === 'black' || st === '#000000') {
              el.setAttribute('stroke', nodeStroke)
              ;(el as SVGElement).style.stroke = nodeStroke
            }
          })
        root
          .querySelectorAll(
            '.edgePath path, .flowchart-link, path.flowchart-link, .edgePaths path',
          )
          .forEach((el) => {
            el.setAttribute('fill', 'none')
            el.setAttribute('stroke', edge)
            ;(el as SVGElement).style.stroke = edge
          })
        root.querySelectorAll('marker path, .arrowheadPath').forEach((el) => {
          el.setAttribute('fill', edge)
          el.setAttribute('stroke', edge)
        })
        root
          .querySelectorAll('.edgeLabel rect, .labelBkg, g.edgeLabel > rect')
          .forEach((el) => {
            el.setAttribute('fill', edgeLabelBg)
            el.setAttribute('stroke', nodeStroke)
          })
        root.querySelectorAll('text, tspan').forEach((el) => {
          el.setAttribute('fill', nodeText)
          ;(el as SVGElement).style.fill = nodeText
        })
        root
          .querySelectorAll(
            'foreignObject div, foreignObject span, .nodeLabel',
          )
          .forEach((el) => {
            const h = el as HTMLElement
            if (!h.style) return
            h.style.color = nodeText
            h.style.background = 'transparent'
            h.style.backgroundColor = 'transparent'
          })
      })
  })
  await page.waitForTimeout(60)
}

/**
 * Replace each pre.mermaid with a PNG screenshot so SVG foreignObject export
 * and dense clips still show diagrams (same idea as Studio SVG export).
 * Expands process cards briefly so Mermaid isn't clipped to an empty chip.
 */
async function rasterizeMermaidBlocks(page: PlaywrightPage): Promise<number> {
  // Expand process cards so diagrams have room to paint before screenshot
  await page.evaluate(() => {
    document.querySelectorAll('article.card[data-process="1"]').forEach((cardEl) => {
      const card = cardEl as HTMLElement
      card.dataset.origW = String(card.offsetWidth)
      card.dataset.origH = String(card.offsetHeight)
      const w = Math.max(card.offsetWidth, 300)
      const h = Math.max(card.offsetHeight, 220)
      card.style.width = `${w}px`
      card.style.height = `${h}px`
      card.style.overflow = 'visible'
      const body = card.querySelector('.card-body') as HTMLElement | null
      if (body) {
        body.style.overflow = 'visible'
        body.style.minHeight = '180px'
      }
      const pre = card.querySelector('pre.mermaid') as HTMLElement | null
      if (pre) {
        pre.style.overflow = 'visible'
        pre.style.maxHeight = 'none'
        pre.style.width = '100%'
        pre.style.minHeight = '160px'
      }
      const svg = card.querySelector('pre.mermaid svg') as SVGSVGElement | null
      if (svg) {
        svg.style.maxWidth = '100%'
        svg.style.maxHeight = 'none'
        svg.style.width = '100%'
        svg.style.height = 'auto'
      }
    })
  })
  await page.waitForTimeout(120)

  let n = 0
  for (let guard = 0; guard < 40; guard++) {
    const loc = page.locator('pre.mermaid').first()
    const count = await loc.count()
    if (count === 0) break
    try {
      const buf = await loc.screenshot({
        type: 'png',
        omitBackground: false,
      })
      if (buf.length < 800) {
        // Nearly empty — try parent card body
        break
      }
      const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
      await page.evaluate((url) => {
        const pre = document.querySelector('pre.mermaid')
        if (!pre) return
        const img = document.createElement('img')
        img.src = url
        img.alt = 'process diagram'
        img.className = 'mermaid-raster'
        img.setAttribute('data-mermaid-raster', '1')
        img.style.cssText =
          'display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;margin:0 auto;background:transparent;'
        pre.replaceWith(img)
      }, dataUrl as never)
      n++
    } catch {
      break
    }
  }

  // Restore original card box sizes so layout matches sheet packing
  await page.evaluate(() => {
    document.querySelectorAll('article.card[data-process="1"]').forEach((cardEl) => {
      const card = cardEl as HTMLElement
      if (card.dataset.origW) card.style.width = `${card.dataset.origW}px`
      if (card.dataset.origH) card.style.height = `${card.dataset.origH}px`
      card.style.overflow = 'hidden'
    })
  })
  await page.waitForTimeout(80)
  return n
}

/**
 * Scale each card's body so KaTeX / Mermaid / tables are fully visible
 * (dense pack often under-sizes height; overflow:hidden was clipping content).
 *
 * Process charts: fit Mermaid SVG via viewBox + max dimensions (never force a
 * min CSS scale that clips the diagram and looks empty). Equations/tables use
 * transform scale with a modest floor.
 */
async function fitCardContents(page: PlaywrightPage): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('.card.abs').forEach((cardEl) => {
      const card = cardEl as HTMLElement
      const body = card.querySelector('.card-body') as HTMLElement | null
      if (!body) return
      const title = card.querySelector('.card-title') as HTMLElement | null
      const isProcess = card.getAttribute('data-process') === '1'

      body.style.transform = ''
      body.style.maxWidth = 'none'
      body.style.maxHeight = 'none'
      body.style.overflow = 'visible'
      card.style.overflow = 'visible'

      const pad = isProcess ? 4 : 8
      const availW = Math.max(8, card.clientWidth - pad)
      const availH = Math.max(
        8,
        card.clientHeight - (title ? title.offsetHeight + 4 : 0) - pad,
      )

      const mermaidSvg = body.querySelector(
        'pre.mermaid svg, .mermaid svg',
      ) as SVGSVGElement | null

      // Mermaid: scale the SVG into the card box (whole diagram visible)
      if (mermaidSvg) {
        const pre = mermaidSvg.closest('pre.mermaid') as HTMLElement | null
        const vb = mermaidSvg.viewBox?.baseVal
        let vw =
          (vb && vb.width > 0 ? vb.width : 0) ||
          mermaidSvg.getBoundingClientRect().width ||
          parseFloat(mermaidSvg.getAttribute('width') || '0') ||
          400
        let vh =
          (vb && vb.height > 0 ? vb.height : 0) ||
          mermaidSvg.getBoundingClientRect().height ||
          parseFloat(mermaidSvg.getAttribute('height') || '0') ||
          300
        // Ensure viewBox so percentage width/height works
        if (!mermaidSvg.getAttribute('viewBox') && vw > 0 && vh > 0) {
          mermaidSvg.setAttribute('viewBox', `0 0 ${vw} ${vh}`)
        }
        // Contain: fit entire diagram in avail box (preserve aspect)
        const fit = Math.min(1, availW / Math.max(vw, 1), availH / Math.max(vh, 1))
        const outW = Math.max(8, Math.floor(vw * fit))
        const outH = Math.max(8, Math.floor(vh * fit))
        mermaidSvg.removeAttribute('width')
        mermaidSvg.removeAttribute('height')
        mermaidSvg.setAttribute('width', String(outW))
        mermaidSvg.setAttribute('height', String(outH))
        mermaidSvg.style.width = `${outW}px`
        mermaidSvg.style.height = `${outH}px`
        mermaidSvg.style.maxWidth = `${availW}px`
        mermaidSvg.style.maxHeight = `${availH}px`
        mermaidSvg.style.display = 'block'
        if (pre) {
          pre.style.margin = '0'
          pre.style.width = '100%'
          pre.style.height = '100%'
          pre.style.maxWidth = '100%'
          pre.style.maxHeight = '100%'
          pre.style.overflow = 'hidden'
          pre.style.display = 'flex'
          pre.style.alignItems = 'center'
          pre.style.justifyContent = 'center'
          pre.style.background = 'transparent'
        }
        body.style.overflow = 'hidden'
        body.style.alignItems = 'center'
        body.style.justifyContent = 'center'
        card.style.overflow = 'hidden'
        return
      }

      const target =
        (body.querySelector(
          '.katex-display, .katex, table, img.fig, img',
        ) as HTMLElement | null) || body

      const rect = target.getBoundingClientRect()
      const tw = Math.max(
        (target as HTMLElement).scrollWidth || 0,
        rect.width || 0,
        1,
      )
      const th = Math.max(
        (target as HTMLElement).scrollHeight || 0,
        rect.height || 0,
        1,
      )

      const scale = Math.min(1, availW / tw, availH / th)
      // Allow smaller scale so content is never clipped to a blank corner
      const minScale = 0.22
      body.style.transformOrigin = 'center center'
      if (scale < 0.995) {
        body.style.transform = `scale(${Math.max(minScale, scale)})`
      }
      body.style.overflow = 'hidden'
      card.style.overflow = 'hidden'
    })
  })
  await page.waitForTimeout(80)
}

async function withPlaywrightPage(
  htmlPath: string,
  opts: ExportHtmlOptions | undefined,
  pageSize: { width: number; height: number },
  run: (page: PlaywrightPage) => Promise<void>,
  /** deviceScaleFactor for crisp PNG/JPG (ignored for PDF vector output) */
  deviceScaleFactor = 1,
): Promise<void> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  try {
    // Viewport in CSS px; bitmap = viewport × deviceScaleFactor
    const vpW = Math.ceil(pageSize.width + 40)
    const vpH = Math.ceil(pageSize.height + 40)
    const context = await browser.newContext({
      viewport: { width: vpW, height: vpH },
      deviceScaleFactor: Math.min(3, Math.max(1, deviceScaleFactor)),
      isMobile: false,
    })
    const page = await context.newPage()
    await page.goto(pathToFileUrl(htmlPath), {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    if (opts?.rich !== false) {
      await page.waitForTimeout(600)
      try {
        await page.waitForFunction(
          () => {
            const blocks = document.querySelectorAll('pre.mermaid').length
            if (blocks === 0) return true
            // Prefer explicit mermaid.run flag; fall back to SVG presence
            const ready = (window as unknown as { __mermaidReady?: boolean })
              .__mermaidReady
            const svgs = document.querySelectorAll(
              'pre.mermaid svg, .mermaid svg',
            ).length
            return Boolean(ready) || svgs >= blocks
          },
          { timeout: 18_000 },
        )
      } catch {
        /* partial ok — fit whatever rendered */
      }
      await page.waitForTimeout(400)
      // Dark node fills (CDN mermaid defaults to pale/white chips)
      await paintMermaidDark(page as never)
      // Fit KaTeX/Mermaid into card boxes (mermaid via viewBox, not clip scale)
      await fitCardContents(page as never)
      await page.waitForTimeout(120)
      // Rasterize diagrams → <img> so PNG/SVG/PDF always show process charts
      // (SVG foreignObject + mermaid htmlLabels otherwise blank out)
      await rasterizeMermaidBlocks(page as never)
      await page.waitForTimeout(80)
    }
    await run(page as never)
    await context.close()
  } finally {
    await browser.close()
  }
}

function pageDims(sheet: SheetDocument, opts?: ExportHtmlOptions) {
  const items = sheet.items.filter((i) => !i.hidden)
  const b = contentBounds(items)
  const layout = opts?.layout ?? 'canvas'
  const width =
    opts?.pageWidth ??
    (layout === 'canvas'
      ? Math.max(LETTER_PX.width, Math.ceil(b.maxX + 24))
      : LETTER_PX.width)
  const height =
    opts?.pageHeight ??
    (layout === 'canvas'
      ? Math.max(LETTER_PX.height, Math.ceil(b.maxY + 24))
      : LETTER_PX.height)
  return { width, height }
}

export async function exportSheetPdf(
  sheet: SheetDocument,
  outPath: string,
  opts?: ExportHtmlOptions & { keepHtml?: boolean },
): Promise<ExportPdfResult> {
  const absPdf = path.resolve(outPath)
  mkdirSync(path.dirname(absPdf), { recursive: true })
  const htmlPath = absPdf.replace(/\.pdf$/i, '') + '.print.html'
  const dims = pageDims(sheet, opts)
  writeSheetHtml(sheet, htmlPath, { layout: 'canvas', ...opts })

  try {
    await withPlaywrightPage(htmlPath, opts, dims, async (page) => {
      await page.pdf({
        path: absPdf,
        width: `${dims.width}px`,
        height: `${dims.height}px`,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      })
    })
    if (!opts?.keepHtml) {
      try {
        const { unlinkSync } = await import('node:fs')
        unlinkSync(htmlPath)
      } catch {
        /* keep */
      }
      return { pdfPath: absPdf, engine: 'playwright' }
    }
    return { pdfPath: absPdf, htmlPath, engine: 'playwright' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `PDF export needs Playwright (npx playwright install chromium).\n` +
        `HTML was written to ${htmlPath}\nOriginal error: ${msg}`,
    )
  }
}

export async function exportSheetImage(
  sheet: SheetDocument,
  outPath: string,
  opts?: ExportHtmlOptions & {
    keepHtml?: boolean
    format?: 'png' | 'jpeg'
    quality?: number
    /** Override scale (default 2 ≈ retina / ~192 DPI letter). */
    scale?: 1 | 2 | 3
  },
): Promise<ExportImageResult> {
  const format =
    opts?.format ?? (/\.jpe?g$/i.test(outPath) ? 'jpeg' : 'png')
  /** Default 2× — previous 1× fullPage screenshots were only ~900×1100 and looked soft. */
  const dpr = Math.min(3, Math.max(1, opts?.scale ?? 2)) as 1 | 2 | 3
  const abs = path.resolve(outPath)
  mkdirSync(path.dirname(abs), { recursive: true })
  const htmlPath = abs.replace(/\.(png|jpe?g)$/i, '') + '.print.html'
  const dims = pageDims(sheet, opts)
  writeSheetHtml(sheet, htmlPath, {
    layout: 'canvas',
    rich: opts?.rich !== false,
    footer: false, // crop to sheet surface only
    ...opts,
  })

  try {
    await withPlaywrightPage(
      htmlPath,
      opts,
      dims,
      async (page) => {
        const shot: Record<string, unknown> = {
          path: abs,
          type: format,
          // Prefer the letter/surface element — avoids soft full-page chrome
          animations: 'disabled',
        }
        if (format === 'jpeg') {
          shot.quality = Math.min(100, Math.max(50, opts?.quality ?? 92))
        }
        const surface = page.locator('.surface')
        if ((await surface.count()) > 0) {
          await surface.first().screenshot(shot)
        } else {
          shot.fullPage = true
          await page.screenshot(shot)
        }
      },
      dpr,
    )
    if (!opts?.keepHtml) {
      try {
        const { unlinkSync } = await import('node:fs')
        unlinkSync(htmlPath)
      } catch {
        /* keep */
      }
      return { imagePath: abs, format, engine: 'playwright' }
    }
    return { imagePath: abs, htmlPath, format, engine: 'playwright' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `Image export needs Playwright.\nHTML: ${htmlPath}\n${msg}`,
    )
  }
}

export async function exportSheetPng(
  sheet: SheetDocument,
  outPath: string,
  opts?: ExportHtmlOptions & { keepHtml?: boolean },
): Promise<ExportImageResult> {
  return exportSheetImage(sheet, outPath, { ...opts, format: 'png' })
}

export async function exportSheetJpeg(
  sheet: SheetDocument,
  outPath: string,
  opts?: ExportHtmlOptions & { keepHtml?: boolean; quality?: number },
): Promise<ExportImageResult> {
  return exportSheetImage(sheet, outPath, { ...opts, format: 'jpeg' })
}

/**
 * Vector-friendly export that **opens in Chrome via file://**.
 *
 * Pure SVG+foreignObject often fails as XML (`&nbsp;` etc. from KaTeX) and
 * CDN CSS is blocked on file://. We instead write a self-contained **HTML**
 * document that uses SVG as the root canvas metaphor — saved as `.svg.html`
 * companion is optional; primary deliverable is a standalone HTML file that
 * zooms sharply (KaTeX + Mermaid already rendered).
 *
 * For a true `.svg` file we still emit one, but with HTML entities sanitized
 * and styles inlined so Chrome's XML parser accepts it.
 *
 * PNG remains raster-only.
 */
export async function exportSheetSvg(
  sheet: SheetDocument,
  outPath: string,
  opts?: ExportHtmlOptions & { keepHtml?: boolean },
): Promise<ExportSvgResult> {
  const absSvg = path.resolve(
    outPath.endsWith('.svg') ? outPath : `${outPath}.svg`,
  )
  // Always also write a Chrome-safe vector HTML next to it (same stem)
  const absHtmlVector = absSvg.replace(/\.svg$/i, '.vector.html')
  mkdirSync(path.dirname(absSvg), { recursive: true })
  const htmlPath = absSvg.replace(/\.svg$/i, '') + '.print.html'
  const dims = pageDims(sheet, opts)
  writeSheetHtml(sheet, htmlPath, {
    layout: 'canvas',
    rich: opts?.rich !== false,
    footer: false,
    dark: opts?.dark !== false,
    ...opts,
  })

  try {
    let width = dims.width
    let height = dims.height
    let surfaceHtml = ''
    let katexCss = ''

    // Inline KaTeX CSS so file:// works offline (CDN blocked on file pages)
    try {
      const res = await fetch(
        'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css',
      )
      if (res.ok) {
        katexCss = await res.text()
        // Point font URLs to absolute CDN (fonts still need network once)
        katexCss = katexCss.replace(
          /url\((?:'|")?fonts\//g,
          "url(https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/fonts/",
        )
      }
    } catch {
      katexCss = '/* katex css fetch failed — equations may lack font metrics */'
    }

    await withPlaywrightPage(
      htmlPath,
      opts,
      dims,
      async (page) => {
        const data = await (page as unknown as {
          evaluate: (fn: () => unknown) => Promise<unknown>
        }).evaluate(() => {
          const surface = document.querySelector(
            '.surface',
          ) as HTMLElement | null
          if (!surface) return { ok: false as const, error: 'missing .surface' }

          surface.querySelectorAll('svg').forEach((svg) => {
            if (!svg.getAttribute('xmlns')) {
              svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
            }
          })

          // Prefer XML serialization (valid for foreignObject)
          let xml = ''
          try {
            xml = new XMLSerializer().serializeToString(surface)
          } catch {
            xml = surface.outerHTML
          }

          const w = Math.ceil(surface.offsetWidth || surface.clientWidth)
          const h = Math.ceil(surface.offsetHeight || surface.clientHeight)
          return { ok: true as const, width: w, height: h, html: xml }
        })

        const d = data as {
          ok: boolean
          width?: number
          height?: number
          html?: string
          error?: string
        }
        if (!d.ok || !d.html) {
          throw new Error(d.error ?? 'Could not serialize sheet surface')
        }
        width = d.width ?? dims.width
        height = d.height ?? dims.height
        surfaceHtml = d.html
      },
      // 2× so mermaid raster screenshots are sharp enough to read
      2,
    )

    // HTML→XML entity fixes (Chrome SVG parser is strict)
    const xhtml = sanitizeHtmlForXml(surfaceHtml)
      // Ensure single xhtml namespace on root
      .replace(/\sxmlns="[^"]*"/g, '')
      .replace(
        /^<([a-zA-Z0-9]+)/,
        '<$1 xmlns="http://www.w3.org/1999/xhtml"',
      )

    const dark = opts?.dark !== false
    const bg = dark ? '#0f1115' : '#faf9f6'
    const fg = dark ? '#e8eaed' : '#1a1a1a'
    const muted = dark ? '#9ca3af' : '#555'
    const card = dark ? 'rgba(28,30,36,0.98)' : 'rgba(255,255,255,0.95)'
    const border = dark ? 'rgba(99,102,241,0.4)' : 'rgba(0,0,0,0.12)'
    const titleSafe = escapeXml(sheet.title.replace(/[—–]/g, '-'))

    const sheetCss = `
.surface { position: relative; width: ${width}px; height: ${height}px; background: ${bg};
  font-family: ui-sans-serif, system-ui, sans-serif; color: ${fg};
  -webkit-font-smoothing: antialiased; }
.card.abs { position: absolute; overflow: hidden; display: flex; flex-direction: column;
  background: ${card}; border: 1px solid ${border}; border-radius: 4px; padding: 3px 5px 4px; }
.card-title { font-size: 7px; text-transform: uppercase; letter-spacing: 0.04em;
  color: ${muted}; margin-bottom: 2px; font-weight: 650; flex-shrink: 0; }
.card-body { flex: 1; min-height: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.latex .katex { font-size: 1em !important; }
pre.mermaid { margin: 0; background: transparent; width: 100%; height: 100%; max-width: 100%; max-height: 100%; overflow: hidden; display: flex; align-items: center; justify-content: center; }
pre.mermaid svg { max-width: 100% !important; max-height: 100% !important; width: 100% !important; height: auto !important; display: block; }
img.mermaid-raster { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; margin: 0 auto; }
.card.abs[data-process="1"] .card-body { align-items: center; justify-content: center; }
.card.abs[data-banner="1"] { border-left-width: 3px; padding: 2px 8px; }
table { border-collapse: collapse; width: 100%; font-size: 0.85em; }
th, td { border: 1px solid ${border}; padding: 1px 3px; }
img.fig { max-width: 100%; max-height: 100%; object-fit: contain; }
`

    // 1) Self-contained HTML — always works with file:// in Chrome (recommended)
    const vectorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeXml(sheet.title.replace(/[—–]/g, '-'))}</title>
<style>
html,body{margin:0;padding:0;background:${dark ? '#09090b' : '#e8e4dc'};}
${katexCss}
${sheetCss}
body{display:flex;justify-content:center;padding:16px;}
</style>
</head>
<body>
${surfaceHtml.replace(/^<div/, '<div').replace(/\sxmlns="[^"]*"/g, '')}
</body>
</html>
`
    writeFileSync(absHtmlVector, vectorHtml, 'utf8')

    // 2) SVG with foreignObject — sanitized XML for viewers that support it
    const svgBody = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>${titleSafe}</title>
  <desc>Open the companion .vector.html in Chrome if this SVG is blank. Vector zoom: HTML/SVG/PDF; PNG is pixels only.</desc>
  <rect width="100%" height="100%" fill="${bg}"/>
  <foreignObject x="0" y="0" width="${width}" height="${height}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;width:${width}px;height:${height}px;background:${bg};">
      <style type="text/css"><![CDATA[
${katexCss}
${sheetCss}
.card.abs .card-body { transform-origin: center center; }
      ]]></style>
      ${xhtml}
    </div>
  </foreignObject>
</svg>
`
    writeFileSync(absSvg, svgBody, 'utf8')

    if (!opts?.keepHtml) {
      try {
        const { unlinkSync } = await import('node:fs')
        unlinkSync(htmlPath)
      } catch {
        /* keep */
      }
      return {
        svgPath: absSvg,
        htmlPath: absHtmlVector,
        width,
        height,
        engine: 'playwright',
      }
    }
    return {
      svgPath: absSvg,
      htmlPath: absHtmlVector,
      width,
      height,
      engine: 'playwright',
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `SVG export needs Playwright (npx playwright install chromium).\n` +
        `HTML was written to ${htmlPath}\n${msg}`,
    )
  }
}

/** Make HTML fragment safe enough for SVG/XML parsers (Chrome file://). */
function sanitizeHtmlForXml(html: string): string {
  return (
    html
      // Named HTML entities that are invalid in XML without a DTD
      .replace(/&nbsp;/gi, '&#160;')
      .replace(/&ensp;/gi, '&#8194;')
      .replace(/&emsp;/gi, '&#8195;')
      .replace(/&thinsp;/gi, '&#8201;')
      .replace(/&zwnj;/gi, '&#8204;')
      .replace(/&zwj;/gi, '&#8205;')
      .replace(/&copy;/gi, '&#169;')
      .replace(/&reg;/gi, '&#174;')
      .replace(/&mdash;/gi, '&#8212;')
      .replace(/&ndash;/gi, '&#8211;')
      .replace(/&lsquo;/gi, '&#8216;')
      .replace(/&rsquo;/gi, '&#8217;')
      .replace(/&ldquo;/gi, '&#8220;')
      .replace(/&rdquo;/gi, '&#8221;')
      .replace(/&hellip;/gi, '&#8230;')
      // Bare ampersands that are not already entities
      .replace(/&(?!(#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/g, '&amp;')
  )
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
