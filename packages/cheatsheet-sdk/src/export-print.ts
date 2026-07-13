/**
 * Headless print export: HTML / PDF / PNG / JPG.
 * Default layout is **canvas** (absolute x/y positions) so dense cheatsheet
 * packing is visible — not a vertical document stack.
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
        const title = it.title
          ? `<div class="card-title">${escapeHtml(it.title)}</div>`
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
        const title = it.title
          ? `<div class="card-title" style="font-size:${tfs}px">${escapeHtml(it.title)}</div>`
          : ''
        return `<article class="card abs" data-type="${escapeHtml(it.type)}"
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
      startOnLoad: true,
      theme: '${mermaidTheme}',
      securityLevel: 'loose',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      flowchart: { nodeSpacing: 12, rankSpacing: 18, padding: 4 },
    });
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
      padding: 12px;
    }
    .surface {
      position: relative;
      background: ${bg};
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
      overflow: hidden;
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
      font-size: 8px;
      white-space: pre-wrap;
      max-width: 100%;
      max-height: 100%;
      overflow: hidden;
      background: transparent;
    }
    pre.mermaid svg { max-width: 100% !important; height: auto !important; }
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

function pathToFileUrl(p: string): string {
  const resolved = path.resolve(p)
  if (process.platform === 'win32') {
    return 'file:///' + resolved.replace(/\\/g, '/')
  }
  return 'file://' + resolved
}

async function withPlaywrightPage(
  htmlPath: string,
  opts: ExportHtmlOptions | undefined,
  pageSize: { width: number; height: number },
  run: (page: {
    screenshot: (o: Record<string, unknown>) => Promise<Buffer>
    pdf: (o: Record<string, unknown>) => Promise<Buffer>
    goto: (url: string, o?: Record<string, unknown>) => Promise<unknown>
    waitForTimeout: (ms: number) => Promise<void>
    setViewportSize: (s: { width: number; height: number }) => Promise<void>
  }) => Promise<void>,
): Promise<void> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setViewportSize({
      width: Math.min(1400, Math.max(900, pageSize.width + 48)),
      height: Math.min(2000, Math.max(1100, pageSize.height + 48)),
    })
    await page.goto(pathToFileUrl(htmlPath), {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    if (opts?.rich !== false) {
      await page.waitForTimeout(900)
      try {
        await page.waitForFunction(
          () => {
            const blocks = document.querySelectorAll('pre.mermaid').length
            const svgs = document.querySelectorAll('pre.mermaid svg, .mermaid svg')
              .length
            return blocks === 0 || svgs > 0
          },
          { timeout: 14_000 },
        )
      } catch {
        /* partial ok */
      }
      await page.waitForTimeout(400)
    }
    await run(page as never)
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
  },
): Promise<ExportImageResult> {
  const format =
    opts?.format ?? (/\.jpe?g$/i.test(outPath) ? 'jpeg' : 'png')
  const abs = path.resolve(outPath)
  mkdirSync(path.dirname(abs), { recursive: true })
  const htmlPath = abs.replace(/\.(png|jpe?g)$/i, '') + '.print.html'
  const dims = pageDims(sheet, opts)
  writeSheetHtml(sheet, htmlPath, {
    layout: 'canvas',
    rich: opts?.rich !== false,
    ...opts,
  })

  try {
    await withPlaywrightPage(htmlPath, opts, dims, async (page) => {
      const shot: Record<string, unknown> = {
        path: abs,
        fullPage: true,
        type: format,
      }
      if (format === 'jpeg') {
        shot.quality = Math.min(100, Math.max(40, opts?.quality ?? 88))
      }
      await page.screenshot(shot)
    })
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
