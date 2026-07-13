/**
 * Headless print export for agents: HTML always; PDF / PNG / JPG via Playwright.
 * Not a pixel-perfect match of the Studio canvas — readable delivery layout.
 * Prefer Studio Export after Import when WYSIWYG fidelity matters.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { CanvasItem, SheetDocument } from './types'
import { LETTER_PX } from './defaults'

export type ExportHtmlOptions = {
  /** Dark theme like the Studio (default true). */
  dark?: boolean
  /** Include page footer with title (default true). */
  footer?: boolean
  /**
   * Load KaTeX + Mermaid from CDN for nicer PDF/PNG (default true).
   * Offline/CI can set false for static markup only.
   */
  rich?: boolean
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
    // Mermaid CDN script renders .mermaid blocks
    return `<pre class="mermaid">${escapeHtml(it.mermaidSource)}</pre>`
  }
  if (it.imageUrl) {
    const src = escapeHtml(it.imageUrl)
    return `<img src="${src}" alt="${escapeHtml(it.title ?? 'figure')}" class="fig" />`
  }
  return '<p class="empty">—</p>'
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
  const bg = dark ? '#0f1115' : '#ffffff'
  const fg = dark ? '#e8eaed' : '#111827'
  const card = dark ? 'rgba(30,32,40,0.95)' : '#f9fafb'
  const border = dark ? 'rgba(99,102,241,0.45)' : '#d1d5db'
  const muted = dark ? '#9ca3af' : '#6b7280'
  const mermaidTheme = dark ? 'dark' : 'default'

  const sorted = [...sheet.items]
    .filter((i) => !i.hidden)
    .sort((a, b) => a.zIndex - b.zIndex)

  const nEq = sorted.filter((i) => i.latex).length
  const nTable = sorted.filter((i) => i.tableMarkdown).length
  const nProc = sorted.filter((i) => i.mermaidSource).length
  const nFig = sorted.filter((i) => i.imageUrl).length

  const cards = sorted
    .map((it) => {
      const title = it.title
        ? `<div class="card-title">${escapeHtml(it.title)}</div>`
        : ''
      return `<article class="card" data-type="${escapeHtml(it.type)}">
  ${title}
  <div class="card-body">${itemBodyHtml(it, rich)}</div>
</article>`
    })
    .join('\n')

  const pageW = LETTER_PX.width
  const pageH = LETTER_PX.height

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
    });
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
      window.__katexReady = true;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(renderKatex, 50);
        setTimeout(renderKatex, 400);
      });
    } else {
      setTimeout(renderKatex, 50);
      setTimeout(renderKatex, 400);
    }
  </script>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(sheet.title)}</title>
  <style>
    @page { size: letter portrait; margin: 0.5in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: ${bg};
      color: ${fg};
      font-size: 14px;
      line-height: 1.45;
    }
    .page {
      max-width: ${pageW}px;
      min-height: ${pageH * 0.5}px;
      margin: 0 auto;
      padding: 24px 28px 40px;
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 650;
      margin: 0 0 0.35rem;
      letter-spacing: -0.02em;
    }
    .meta {
      color: ${muted};
      font-size: 11px;
      margin-bottom: 1.25rem;
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card {
      background: ${card};
      border: 1px solid ${border};
      border-radius: 8px;
      padding: 10px 12px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .card[data-type="process-chart"] {
      border-color: ${dark ? 'rgba(129,140,248,0.55)' : '#a5b4fc'};
    }
    .card[data-type="figure"] {
      border-color: ${dark ? 'rgba(52,211,153,0.45)' : '#6ee7b7'};
    }
    .card-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: ${muted};
      margin-bottom: 6px;
      font-weight: 600;
    }
    .card-body { overflow-x: auto; }
    .latex { font-size: 1.05em; overflow-x: auto; }
    .latex code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 12px;
    }
    th, td {
      border: 1px solid ${border};
      padding: 4px 8px;
      text-align: left;
    }
    th { color: ${muted}; font-weight: 600; }
    pre.mermaid {
      margin: 0;
      font-size: 11px;
      white-space: pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: ${muted};
      background: transparent;
    }
    pre.mermaid svg { max-width: 100%; height: auto; }
    img.fig {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    footer {
      margin-top: 2rem;
      font-size: 10px;
      color: ${muted};
      border-top: 1px solid ${border};
      padding-top: 8px;
    }
    @media print {
      body { background: ${bg}; }
      .page { max-width: none; padding: 0; }
    }
  </style>
  ${richHead}
</head>
<body>
  <div class="page" data-export-ready="0">
    <h1>${escapeHtml(sheet.title)}</h1>
    <div class="meta">${sorted.length} cards · ${nEq} eq · ${nTable} table · ${nProc} process · ${nFig} figure · agent export</div>
    <div class="cards">
${cards}
    </div>
    ${
      footer
        ? `<footer>Generated for print · re-open JSON in Studio for interactive editing · Studio PDF is WYSIWYG</footer>`
        : ''
    }
  </div>
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

async function withPlaywrightPage(
  htmlPath: string,
  opts: ExportHtmlOptions | undefined,
  run: (page: {
    screenshot: (o: Record<string, unknown>) => Promise<Buffer>
    pdf: (o: Record<string, unknown>) => Promise<Buffer>
    goto: (url: string, o?: Record<string, unknown>) => Promise<unknown>
    waitForTimeout: (ms: number) => Promise<void>
    setViewportSize: (s: { width: number; height: number }) => Promise<void>
    locator: (sel: string) => { boundingBox: () => Promise<{ width: number; height: number } | null> }
    evaluate: (fn: () => unknown) => Promise<unknown>
  }) => Promise<void>,
): Promise<void> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setViewportSize({ width: 920, height: 1280 })
    const fileUrl = pathToFileUrl(htmlPath)
    await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 60_000 })
    // Allow KaTeX + Mermaid CDN time to paint
    if (opts?.rich !== false) {
      await page.waitForTimeout(800)
      try {
        await page.waitForFunction(
          () => {
            const latex = document.querySelectorAll('.latex .katex, .latex[data-latex]').length
            const mermaidSvg = document.querySelectorAll('pre.mermaid svg, .mermaid svg').length
            const mermaidBlocks = document.querySelectorAll('pre.mermaid').length
            // ready if no mermaid or at least one svg, and katex attempted
            const mermaidOk = mermaidBlocks === 0 || mermaidSvg > 0
            return mermaidOk
          },
          { timeout: 12_000 },
        )
      } catch {
        /* still screenshot partial */
      }
      await page.waitForTimeout(300)
    }
    await run(page as never)
  } finally {
    await browser.close()
  }
}

function pathToFileUrl(p: string): string {
  const resolved = path.resolve(p)
  if (process.platform === 'win32') {
    return 'file:///' + resolved.replace(/\\/g, '/')
  }
  return 'file://' + resolved
}

/**
 * Export PDF using Playwright Chromium when available.
 */
export async function exportSheetPdf(
  sheet: SheetDocument,
  outPath: string,
  opts?: ExportHtmlOptions & { keepHtml?: boolean },
): Promise<ExportPdfResult> {
  const absPdf = path.resolve(outPath)
  mkdirSync(path.dirname(absPdf), { recursive: true })
  const htmlPath = absPdf.replace(/\.pdf$/i, '') + '.print.html'
  writeSheetHtml(sheet, htmlPath, opts)

  try {
    await withPlaywrightPage(htmlPath, opts, async (page) => {
      await page.pdf({
        path: absPdf,
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
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
        `HTML was written to ${htmlPath}\n` +
        `Original error: ${msg}`,
    )
  }
}

/**
 * Full-page PNG or JPEG screenshot of the print HTML (Playwright).
 */
export async function exportSheetImage(
  sheet: SheetDocument,
  outPath: string,
  opts?: ExportHtmlOptions & {
    keepHtml?: boolean
    format?: 'png' | 'jpeg'
    /** JPEG quality 0–100 (default 88) */
    quality?: number
  },
): Promise<ExportImageResult> {
  const format =
    opts?.format ??
    (/\.jpe?g$/i.test(outPath) ? 'jpeg' : 'png')
  const abs = path.resolve(outPath)
  mkdirSync(path.dirname(abs), { recursive: true })
  const htmlPath =
    abs.replace(/\.(png|jpe?g)$/i, '') + '.print.html'
  writeSheetHtml(sheet, htmlPath, { ...opts, rich: opts?.rich !== false })

  try {
    await withPlaywrightPage(htmlPath, opts, async (page) => {
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
      `Image export needs Playwright (npx playwright install chromium).\n` +
        `HTML was written to ${htmlPath}\n` +
        `Original error: ${msg}`,
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
