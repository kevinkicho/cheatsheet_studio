/**
 * Headless print export for agents: HTML always, PDF via Playwright when available.
 * Not a pixel-perfect match of the Studio canvas — readable print layout for delivery.
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

function itemBodyHtml(it: CanvasItem): string {
  if (it.latex) {
    // KaTeX optional — show raw LaTeX with $$ delimiters for copy / external render
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

/**
 * Build a standalone HTML print document from a SheetDocument.
 */
export function sheetToPrintHtml(
  sheet: SheetDocument,
  opts: ExportHtmlOptions = {},
): string {
  const dark = opts.dark !== false
  const footer = opts.footer !== false
  const bg = dark ? '#0f1115' : '#ffffff'
  const fg = dark ? '#e8eaed' : '#111827'
  const card = dark ? 'rgba(30,32,40,0.95)' : '#f9fafb'
  const border = dark ? 'rgba(99,102,241,0.45)' : '#d1d5db'
  const muted = dark ? '#9ca3af' : '#6b7280'

  const sorted = [...sheet.items]
    .filter((i) => !i.hidden)
    .sort((a, b) => a.zIndex - b.zIndex)

  const cards = sorted
    .map((it) => {
      const title = it.title
        ? `<div class="card-title">${escapeHtml(it.title)}</div>`
        : ''
      return `<article class="card" data-type="${escapeHtml(it.type)}">
  ${title}
  <div class="card-body">${itemBodyHtml(it)}</div>
</article>`
    })
    .join('\n')

  const pageW = LETTER_PX.width
  const pageH = LETTER_PX.height

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
      margin: 0 0 1rem;
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
    .card-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: ${muted};
      margin-bottom: 6px;
      font-weight: 600;
    }
    .card-body { overflow-x: auto; }
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
    }
    img.fig {
      max-width: 100%;
      height: auto;
      display: block;
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
</head>
<body>
  <div class="page">
    <h1>${escapeHtml(sheet.title)}</h1>
    <div class="meta">${sorted.length} cards · CheatSheet Studio agent export</div>
    <div class="cards">
${cards}
    </div>
    ${
      footer
        ? `<footer>Generated for print · re-open JSON in Studio for interactive editing</footer>`
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

/**
 * Export PDF using Playwright Chromium when available (monorepo has it for E2E).
 * Falls back to writing HTML only and throwing a clear error if PDF requested without Playwright.
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
    // Optional peer: use monorepo / user-installed playwright
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      const fileUrl = pathToFileUrl(htmlPath)
      await page.goto(fileUrl, { waitUntil: 'networkidle' })
      await page.pdf({
        path: absPdf,
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      })
    } finally {
      await browser.close()
    }
    if (!opts?.keepHtml) {
      try {
        const { unlinkSync } = await import('node:fs')
        unlinkSync(htmlPath)
      } catch {
        /* keep html if delete fails */
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

function pathToFileUrl(p: string): string {
  const resolved = path.resolve(p)
  // Windows: C:\foo → file:///C:/foo
  if (process.platform === 'win32') {
    return 'file:///' + resolved.replace(/\\/g, '/')
  }
  return 'file://' + resolved
}
