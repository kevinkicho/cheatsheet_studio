import { describe, expect, it } from 'vitest'
import { createSheet } from './builder'
import { sheetToPrintHtml, writeSheetHtml } from './export-print'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('export-print', () => {
  it('renders latex and table into HTML', () => {
    const sheet = createSheet({ title: 'Print me' })
      .addEquation({ title: 'E', latex: 'E=mc^2' })
      .addTable({
        title: 'T',
        tableMarkdown: '| a | b |\n|---|---|\n| 1 | 2 |',
      })
      .build()
    const html = sheetToPrintHtml(sheet)
    expect(html).toContain('Print me')
    expect(html).toContain('E=mc^2')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>')
  })

  it('writes HTML file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cs-print-'))
    const out = path.join(dir, 't.html')
    const sheet = createSheet({ title: 'F' }).addEquation({ latex: '1' }).build()
    writeSheetHtml(sheet, out)
    const raw = readFileSync(out, 'utf8')
    expect(raw).toContain('</html>')
  })

  it('rich HTML includes KaTeX hooks and mermaid blocks', () => {
    const sheet = createSheet({ title: 'Rich' })
      .addEquation({ title: 'E', latex: 'E=mc^2' })
      .addProcess({
        title: 'Flow',
        mermaidSource: 'flowchart TD\n  A-->B',
      })
      .build()
    const html = sheetToPrintHtml(sheet, { rich: true, layout: 'canvas' })
    expect(html).toContain('katex')
    expect(html).toContain('data-latex')
    expect(html).toContain('class="mermaid"')
    expect(html).toContain('flowchart TD')
    expect(html).toContain('position: absolute')
  })
})
